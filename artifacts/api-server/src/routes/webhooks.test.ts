/**
 * @fileOverview Verification role: exercises Webhooks.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Tests for the RevenueCat webhook:
 *  • rejects when the shared secret is not configured (503)
 *  • rejects a wrong/missing Authorization header (401)
 *  • grants premium on a purchase event and records the expiry
 *  • clears premium on an EXPIRATION event
 *  • ignores anonymous (non-numeric) app_user_ids and non-entitlement events
 *  • applies every event id only once
 *  • authoritatively reconciles both numeric sides of a transfer
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";

let setMock: ReturnType<typeof vi.fn>;
let whereMock: ReturnType<typeof vi.fn>;
let insertValuesMock: ReturnType<typeof vi.fn>;
let receiptInserted: boolean;

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  return {
    db: { update: vi.fn(), insert: vi.fn(), transaction: vi.fn() },
    revenuecatWebhookEventsTable: stub("revenuecat_webhook_events"),
    usersTable: stub("users"),
  };
});

import { db } from "@workspace/db";
import webhooksRouter from "./webhooks.js";

const SECRET = "test-webhook-secret";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", webhooksRouter);
  return app;
}

function post(body: unknown, auth?: string) {
  const req = request(buildApp()).post("/api/webhooks/revenuecat");
  if (auth !== undefined) req.set("Authorization", auth);
  return req.send(body as object);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.REVENUECAT_WEBHOOK_AUTH = SECRET;
  process.env.REVENUECAT_SECRET_API_KEY = "test-secret-api-key";
  receiptInserted = true;
  whereMock = vi.fn().mockResolvedValue(undefined);
  setMock = vi.fn(() => ({ where: whereMock }));
  vi.mocked(db.update).mockImplementation(
    () => ({ set: setMock }) as unknown as ReturnType<typeof db.update>,
  );
  insertValuesMock = vi.fn(() => ({
    onConflictDoNothing: vi.fn(() => ({
      returning: vi.fn().mockImplementation(async () =>
        receiptInserted ? [{ eventId: "event-id" }] : [],
      ),
    })),
  }));
  vi.mocked(db.insert).mockImplementation(
    () => ({ values: insertValuesMock }) as unknown as ReturnType<typeof db.insert>,
  );
  vi.mocked(db.transaction).mockImplementation(async (callback) =>
    callback(db as unknown as Parameters<typeof callback>[0]),
  );
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  delete process.env.REVENUECAT_WEBHOOK_AUTH;
  delete process.env.REVENUECAT_SECRET_API_KEY;
  vi.unstubAllGlobals();
});

describe("POST /api/webhooks/revenuecat", () => {
  it("returns 503 when no shared secret is configured", async () => {
    delete process.env.REVENUECAT_WEBHOOK_AUTH;
    const res = await post({ event: { id: "evt-1", type: "INITIAL_PURCHASE", app_user_id: "1" } }, SECRET);
    expect(res.status).toBe(503);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong Authorization header", async () => {
    const res = await post({ event: { id: "evt-1", type: "INITIAL_PURCHASE", app_user_id: "1" } }, "nope");
    expect(res.status).toBe(401);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("maps a legacy premium purchase to Pro and records the expiry", async () => {
    const expiresMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const res = await post(
      {
        event: {
          id: "evt-pro",
          type: "INITIAL_PURCHASE",
          app_user_id: "42",
          entitlement_ids: ["premium"],
          expiration_at_ms: expiresMs,
        },
      },
      SECRET,
    );
    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({
      plan: "pro",
      planExpiresAt: new Date(expiresMs).toISOString(),
    });
  });

  it("grants Plus for the plus entitlement", async () => {
    const expiresMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const res = await post(
      {
        event: {
          id: "evt-plus",
          type: "INITIAL_PURCHASE",
          app_user_id: "42",
          entitlement_ids: ["plus"],
          expiration_at_ms: expiresMs,
        },
      },
      SECRET,
    );
    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({
      plan: "plus",
      planExpiresAt: new Date(expiresMs).toISOString(),
    });
  });

  it("clears premium on EXPIRATION", async () => {
    const res = await post(
      { event: { id: "evt-expiry", type: "EXPIRATION", app_user_id: "42", entitlement_ids: ["premium"] } },
      SECRET,
    );
    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ plan: "free", planExpiresAt: null });
  });

  it("does not reconcile for an anonymous app_user_id", async () => {
    const res = await post(
      { event: { id: "evt-anon", type: "INITIAL_PURCHASE", app_user_id: "$RCAnonymousID:abc", entitlement_ids: ["premium"] } },
      SECRET,
    );
    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledOnce();
  });

  it("keeps the plan on a CANCELLATION event (entitled until expiry)", async () => {
    const res = await post(
      { event: { id: "evt-cancel", type: "CANCELLATION", app_user_id: "42", entitlement_ids: ["premium"] } },
      SECRET,
    );
    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("acknowledges a duplicate event without applying its update again", async () => {
    receiptInserted = false;
    const res = await post(
      {
        event: {
          id: "evt-duplicate",
          type: "RENEWAL",
          app_user_id: "42",
          entitlement_ids: ["pro"],
        },
      },
      SECRET,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, duplicate: true });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("does not make an entitlement write when the event id is missing", async () => {
    const res = await post(
      {
        event: {
          type: "INITIAL_PURCHASE",
          app_user_id: "42",
          entitlement_ids: ["pro"],
        },
      },
      SECRET,
    );

    expect(res.status).toBe(200);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("reconciles the source and destination of a TRANSFER from Customer Info", async () => {
    const destinationExpiry = new Date(Date.now() + 30 * 86_400_000).toISOString();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const entitlements = url.endsWith("/42")
        ? {}
        : { pro: { expires_date: destinationExpiry } };
      return {
        ok: true,
        status: 200,
        json: async () => ({ subscriber: { entitlements } }),
      } as Response;
    });

    const res = await post(
      {
        event: {
          id: "evt-transfer",
          type: "TRANSFER",
          transferred_from: ["$RCAnonymousID:old", "42"],
          transferred_to: ["84", "$RCAnonymousID:new"],
        },
      },
      SECRET,
    );

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(setMock).toHaveBeenNthCalledWith(1, {
      plan: "free",
      planExpiresAt: null,
    });
    expect(setMock).toHaveBeenNthCalledWith(2, {
      plan: "pro",
      planExpiresAt: destinationExpiry,
    });
    expect(insertValuesMock).toHaveBeenCalledWith({
      eventId: "evt-transfer",
      eventType: "TRANSFER",
    });
  });

  it("returns 500 without recording a TRANSFER when RevenueCat is unavailable", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response);
    const res = await post(
      {
        event: {
          id: "evt-transfer-retry",
          type: "TRANSFER",
          transferred_from: ["42"],
          transferred_to: ["84"],
        },
      },
      SECRET,
    );

    expect(res.status).toBe(500);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
});

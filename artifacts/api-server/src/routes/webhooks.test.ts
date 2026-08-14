/**
 * Tests for the RevenueCat webhook:
 *  • rejects when the shared secret is not configured (503)
 *  • rejects a wrong/missing Authorization header (401)
 *  • grants premium on a purchase event and records the expiry
 *  • clears premium on an EXPIRATION event
 *  • ignores anonymous (non-numeric) app_user_ids and non-entitlement events
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";

let setMock: ReturnType<typeof vi.fn>;
let whereMock: ReturnType<typeof vi.fn>;

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  return {
    db: { update: vi.fn() },
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
  whereMock = vi.fn().mockResolvedValue(undefined);
  setMock = vi.fn(() => ({ where: whereMock }));
  vi.mocked(db.update).mockImplementation(
    () => ({ set: setMock }) as unknown as ReturnType<typeof db.update>,
  );
});

afterEach(() => {
  delete process.env.REVENUECAT_WEBHOOK_AUTH;
});

describe("POST /api/webhooks/revenuecat", () => {
  it("returns 503 when no shared secret is configured", async () => {
    delete process.env.REVENUECAT_WEBHOOK_AUTH;
    const res = await post({ event: { type: "INITIAL_PURCHASE", app_user_id: "1" } }, SECRET);
    expect(res.status).toBe(503);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong Authorization header", async () => {
    const res = await post({ event: { type: "INITIAL_PURCHASE", app_user_id: "1" } }, "nope");
    expect(res.status).toBe(401);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("grants premium and records the expiry on INITIAL_PURCHASE", async () => {
    const expiresMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const res = await post(
      {
        event: {
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
      plan: "premium",
      planExpiresAt: new Date(expiresMs).toISOString(),
    });
  });

  it("clears premium on EXPIRATION", async () => {
    const res = await post(
      { event: { type: "EXPIRATION", app_user_id: "42", entitlement_ids: ["premium"] } },
      SECRET,
    );
    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ plan: "free", planExpiresAt: null });
  });

  it("does not reconcile for an anonymous app_user_id", async () => {
    const res = await post(
      { event: { type: "INITIAL_PURCHASE", app_user_id: "$RCAnonymousID:abc", entitlement_ids: ["premium"] } },
      SECRET,
    );
    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("keeps the plan on a CANCELLATION event (entitled until expiry)", async () => {
    const res = await post(
      { event: { type: "CANCELLATION", app_user_id: "42", entitlement_ids: ["premium"] } },
      SECRET,
    );
    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });
});

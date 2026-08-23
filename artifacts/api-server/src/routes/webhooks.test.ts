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
 *  • applies each event id once, however many times it is delivered
 *  • moves a subscription between accounts on TRANSFER
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";

let setMock: ReturnType<typeof vi.fn>;
let whereMock: ReturnType<typeof vi.fn>;
let deleteWhereMock: ReturnType<typeof vi.fn>;
/** Event ids the fake table has accepted, i.e. the primary key's contents. */
let claimedEventIds: Set<string>;
/** Rows the transfer path reads for the source accounts. */
let sourceAccounts: { id: number; plan: string; planExpiresAt: string | null }[];

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  return {
    db: {
      update: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
      select: vi.fn(),
    },
    usersTable: stub("users"),
    webhookEventsTable: stub("webhook_events"),
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
  claimedEventIds = new Set();
  sourceAccounts = [];
  whereMock = vi.fn().mockResolvedValue(undefined);
  setMock = vi.fn(() => ({ where: whereMock }));
  vi.mocked(db.update).mockImplementation(
    () => ({ set: setMock }) as unknown as ReturnType<typeof db.update>,
  );

  // Stands in for the webhook_events primary key: the first insert of an id
  // returns a row, later inserts conflict and return none.
  vi.mocked(db.insert).mockImplementation(
    () =>
      ({
        values: (row: { eventId: string }) => ({
          onConflictDoNothing: () => ({
            returning: async () =>
              claimedEventIds.has(row.eventId)
                ? []
                : (claimedEventIds.add(row.eventId), [{ eventId: row.eventId }]),
          }),
        }),
      }) as unknown as ReturnType<typeof db.insert>,
  );
  // Only ever one claim is outstanding in a test, so releasing clears the set.
  deleteWhereMock = vi.fn(async () => {
    claimedEventIds.clear();
  });
  vi.mocked(db.delete).mockImplementation(
    () => ({ where: deleteWhereMock }) as unknown as ReturnType<typeof db.delete>,
  );
  vi.mocked(db.select).mockImplementation(
    () =>
      ({
        from: () => ({ where: async () => sourceAccounts }),
      }) as unknown as ReturnType<typeof db.select>,
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

  it("maps a legacy premium purchase to Pro and records the expiry", async () => {
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
      plan: "pro",
      planExpiresAt: new Date(expiresMs).toISOString(),
    });
  });

  it("grants Plus for the plus entitlement", async () => {
    const expiresMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const res = await post(
      {
        event: {
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

  it("stores the role-specific plan exactly as bought", async () => {
    for (const [entitlement, plan] of [
      ["teacher-pro", "teacher-pro"],
      ["teacher-plus", "teacher-plus"],
      ["student-pro", "student-pro"],
      ["student-plus", "student-plus"],
    ] as const) {
      setMock.mockClear();
      const res = await post(
        {
          event: {
            type: "INITIAL_PURCHASE",
            app_user_id: "42",
            entitlement_ids: [entitlement],
          },
        },
        SECRET,
      );
      expect(res.status).toBe(200);
      expect(setMock).toHaveBeenCalledWith({ plan, planExpiresAt: null });
    }
  });

  it("lets the strongest entitlement win when several arrive together", async () => {
    const res = await post(
      {
        event: {
          type: "INITIAL_PURCHASE",
          app_user_id: "42",
          entitlement_ids: ["plus", "teacher-pro"],
        },
      },
      SECRET,
    );
    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({
      plan: "teacher-pro",
      planExpiresAt: null,
    });
  });

  it("ignores a purchase that only carries unknown entitlements", async () => {
    const res = await post(
      {
        event: {
          type: "INITIAL_PURCHASE",
          app_user_id: "42",
          entitlement_ids: ["battle-pass"],
        },
      },
      SECRET,
    );
    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
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

describe("POST /api/webhooks/revenuecat, repeated deliveries", () => {
  const renewal = (expiresMs: number) => ({
    event: {
      id: "evt_renewal_1",
      type: "RENEWAL",
      app_user_id: "42",
      entitlement_ids: ["pro"],
      expiration_at_ms: expiresMs,
    },
  });

  it("applies an event id once, however many times it arrives", async () => {
    const expiresMs = Date.parse("2026-12-01T00:00:00.000Z");

    const first = await post(renewal(expiresMs), SECRET);
    expect(first.status).toBe(200);
    expect(setMock).toHaveBeenCalledTimes(1);

    // RevenueCat retries until it gets a 2xx, so the same delivery lands again
    // after any timeout or deploy. Re-applying it would re-write an expiry a
    // later event may already have superseded.
    const second = await post(renewal(expiresMs), SECRET);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
    expect(setMock).toHaveBeenCalledTimes(1);
  });

  it("still applies an event that carries no id", async () => {
    // Refusing it would drop a real entitlement change over a missing field.
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
    expect(setMock).toHaveBeenCalledTimes(1);
  });

  it("releases the claim when the write fails, so the retry applies", async () => {
    whereMock.mockRejectedValueOnce(new Error("connection reset"));

    const failed = await post(renewal(1), SECRET);
    expect(failed.status).toBe(500);
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);

    const retry = await post(renewal(1), SECRET);
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual({ received: true });
  });

  it("does not spend a claim on an event that changes nothing", async () => {
    const res = await post(
      {
        event: {
          id: "evt_cancel_1",
          type: "CANCELLATION",
          app_user_id: "42",
          entitlement_ids: ["pro"],
        },
      },
      SECRET,
    );
    expect(res.status).toBe(200);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/revenuecat, TRANSFER", () => {
  const transfer = {
    event: {
      id: "evt_transfer_1",
      type: "TRANSFER",
      transferred_from: ["7"],
      transferred_to: ["9"],
    },
  };

  it("moves the plan to the destination and frees the source", async () => {
    sourceAccounts = [
      { id: 7, plan: "teacher-pro", planExpiresAt: "2026-12-01T00:00:00.000Z" },
    ];

    const res = await post(transfer, SECRET);

    expect(res.status).toBe(200);
    // Granted first, then revoked: the destination is never briefly unentitled.
    expect(setMock).toHaveBeenNthCalledWith(1, {
      plan: "teacher-pro",
      planExpiresAt: "2026-12-01T00:00:00.000Z",
    });
    expect(setMock).toHaveBeenNthCalledWith(2, {
      plan: "free",
      planExpiresAt: null,
    });
  });

  it("keeps an account entitled when it transfers to itself", async () => {
    sourceAccounts = [{ id: 7, plan: "pro", planExpiresAt: null }];

    const res = await post(
      {
        event: {
          ...transfer.event,
          transferred_from: ["7"],
          transferred_to: ["7", "9"],
        },
      },
      SECRET,
    );

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith({ plan: "pro", planExpiresAt: null });
  });

  it("changes nothing when the source holds no paid plan", async () => {
    sourceAccounts = [{ id: 7, plan: "free", planExpiresAt: null }];

    const res = await post(transfer, SECRET);

    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("ignores a transfer between anonymous aliases", async () => {
    const res = await post(
      {
        event: {
          ...transfer.event,
          transferred_from: ["$RCAnonymousID:abc"],
          transferred_to: ["$RCAnonymousID:def"],
        },
      },
      SECRET,
    );

    expect(res.status).toBe(200);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("applies a transfer once", async () => {
    sourceAccounts = [{ id: 7, plan: "pro", planExpiresAt: null }];

    await post(transfer, SECRET);
    const repeat = await post(transfer, SECRET);

    expect(repeat.body).toEqual({ received: true, duplicate: true });
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});

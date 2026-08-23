/**
 * @fileOverview Verification role: protects immediate RevenueCat reconciliation and plan/role separation.
 * System connection: exercises the authenticated billing route used after native purchase and restore.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const updateWhere = vi.fn();
const updateSet = vi.fn(() => ({ where: updateWhere }));

vi.mock("@workspace/db", () => ({
  db: {
    update: vi.fn(() => ({ set: updateSet })),
  },
  usersTable: { id: "id", plan: "plan", planExpiresAt: "plan_expires_at" },
}));

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (
    req: { userId?: number; userRole?: string; accountRole?: string },
    _res: unknown,
    next: () => void,
  ) => {
    req.userId = 42;
    req.userRole = "teacher";
    req.accountRole = "student";
    next();
  },
}));

vi.mock("../lib/revenuecat", () => ({
  fetchRevenueCatPlan: vi.fn(),
}));

import { db } from "@workspace/db";
import { fetchRevenueCatPlan } from "../lib/revenuecat";
import billingRouter from "./billing";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", billingRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  updateWhere.mockResolvedValue(undefined);
});

describe("POST /api/users/me/entitlements/reconcile", () => {
  it("stores the trusted paid plan for the authenticated RevenueCat alias", async () => {
    vi.mocked(fetchRevenueCatPlan).mockResolvedValue({
      plan: "pro",
      planExpiresAt: "2026-09-22T12:00:00.000Z",
    });

    const response = await request(buildApp()).post(
      "/api/users/me/entitlements/reconcile",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      plan: "pro",
      planExpiresAt: "2026-09-22T12:00:00.000Z",
    });
    expect(fetchRevenueCatPlan).toHaveBeenCalledWith("42");
    // Exact matching proves reconciliation cannot promote a role, switch the
    // active workspace, or replace any unrelated user data.
    expect(updateSet).toHaveBeenCalledWith({
      plan: "pro",
      planExpiresAt: "2026-09-22T12:00:00.000Z",
    });
  });

  it("returns an authoritative Free plan after expiry without deleting account data", async () => {
    vi.mocked(fetchRevenueCatPlan).mockResolvedValue({
      plan: "free",
      planExpiresAt: null,
    });

    const response = await request(buildApp()).post(
      "/api/users/me/entitlements/reconcile",
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ plan: "free", planExpiresAt: null });
    expect(updateSet).toHaveBeenCalledWith({
      plan: "free",
      planExpiresAt: null,
    });
    expect(db.update).toHaveBeenCalledOnce();
  });

  it("does not change the stored plan when RevenueCat cannot be verified", async () => {
    vi.mocked(fetchRevenueCatPlan).mockRejectedValue(
      new Error("RevenueCat unavailable"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await request(buildApp()).post(
      "/api/users/me/entitlements/reconcile",
    );

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: "Unable to verify purchases right now",
    });
    expect(db.update).not.toHaveBeenCalled();
  });
});

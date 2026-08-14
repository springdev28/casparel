/**
 * Tests for entitlement helpers:
 *  • isPlanActive , pure predicate over (plan, expiresAt)
 *  • isPremiumAccount, reads the account row and applies isPlanActive
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@workspace/db", () => {
  const stub = (name: string) => ({ _name: name });
  return {
    db: { select: vi.fn() },
    usersTable: stub("users"),
  };
});

import { db } from "@workspace/db";
import { isPlanActive, isPremiumAccount } from "./entitlements.js";

function mockAccountRow(row: Record<string, unknown> | null) {
  vi.mocked(db.select).mockImplementation(
    () =>
      ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(row ? [row] : []),
      }) as unknown as ReturnType<typeof db.select>,
  );
}

describe("isPlanActive", () => {
  it("is false for the free plan", () => {
    expect(isPlanActive("free", null)).toBe(false);
  });

  it("is true for premium with no expiry", () => {
    expect(isPlanActive("premium", null)).toBe(true);
  });

  it("is true for premium that expires in the future", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isPlanActive("premium", future)).toBe(true);
  });

  it("is false for premium that already expired", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isPlanActive("premium", past)).toBe(false);
  });

  it("is false for an unknown plan value or null", () => {
    expect(isPlanActive("plus", null)).toBe(false);
    expect(isPlanActive(null, null)).toBe(false);
  });
});

describe("isPremiumAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true for an active premium account", async () => {
    mockAccountRow({ plan: "premium", expiresAt: null });
    await expect(isPremiumAccount(1)).resolves.toBe(true);
  });

  it("returns false for a free account", async () => {
    mockAccountRow({ plan: "free", expiresAt: null });
    await expect(isPremiumAccount(1)).resolves.toBe(false);
  });

  it("returns false when the account is missing", async () => {
    mockAccountRow(null);
    await expect(isPremiumAccount(999)).resolves.toBe(false);
  });

  it("returns false when the premium entitlement has expired", async () => {
    mockAccountRow({ plan: "premium", expiresAt: new Date(Date.now() - 1000).toISOString() });
    await expect(isPremiumAccount(1)).resolves.toBe(false);
  });
});

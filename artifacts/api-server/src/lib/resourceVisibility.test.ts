/**
 * @fileOverview Verification role: exercises Resource Visibility.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Tests for who can see unverified resources.
 *
 * The rules are load-bearing: too strict and a user's own pending submission
 * vanishes from their library (which reads as a bug and causes duplicate
 * saves); too loose and the review queue protects nobody.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  resourcesTable: {
    verificationStatus: { name: "verification_status" },
    submittedById: { name: "submitted_by_id" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: { name: string }, value: unknown) => ({ op: "eq", col: col.name, value }),
  or: (...parts: unknown[]) => ({ op: "or", parts }),
}));

import { resourceVisibilityCondition, optionalViewerId } from "./resourceVisibility.js";
import { issueToken } from "./auth.js";

describe("resourceVisibilityCondition", () => {
  it("applies no filter for admins", () => {
    expect(resourceVisibilityCondition(1, true)).toBeUndefined();
    expect(resourceVisibilityCondition(null, true)).toBeUndefined();
  });

  it("restricts anonymous viewers to verified resources only", () => {
    expect(resourceVisibilityCondition(null, false)).toMatchObject({
      op: "eq",
      col: "verification_status",
      value: "verified",
    });
  });

  it("lets a signed-in viewer additionally see their own submissions", () => {
    const condition = resourceVisibilityCondition(42, false) as unknown as {
      op: string;
      parts: Array<Record<string, unknown>>;
    };
    expect(condition.op).toBe("or");
    expect(condition.parts).toEqual([
      { op: "eq", col: "verification_status", value: "verified" },
      { op: "eq", col: "submitted_by_id", value: 42 },
    ]);
  });
});

describe("optionalViewerId", () => {
  function req(authorization?: string) {
    return { headers: authorization ? { authorization } : {} } as never;
  }

  it("returns null without a bearer token", () => {
    expect(optionalViewerId(req())).toBeNull();
    expect(optionalViewerId(req("Basic abc"))).toBeNull();
  });

  it("returns null for a malformed token rather than throwing", () => {
    expect(optionalViewerId(req("Bearer not-a-token"))).toBeNull();
  });

  it("reads the user id from a valid token", () => {
    expect(optionalViewerId(req(`Bearer ${issueToken(9, "student")}`))).toBe(9);
  });
});

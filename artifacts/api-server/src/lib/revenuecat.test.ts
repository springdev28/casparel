/**
 * @fileOverview Verification role: exercises Revenuecat.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import { revenueCatPlanFromCustomerInfo } from "./revenuecat";

const NOW = new Date("2026-08-22T12:00:00.000Z").getTime();

describe("revenueCatPlanFromCustomerInfo", () => {
  it("returns free when all known entitlements are expired", () => {
    expect(
      revenueCatPlanFromCustomerInfo(
        {
          subscriber: {
            entitlements: {
              pro: { expires_date: "2026-08-21T12:00:00.000Z" },
            },
          },
        },
        NOW,
      ),
    ).toEqual({ plan: "free", planExpiresAt: null });
  });

  it("uses a current grace-period expiry", () => {
    expect(
      revenueCatPlanFromCustomerInfo(
        {
          subscriber: {
            entitlements: {
              plus: {
                expires_date: "2026-08-21T12:00:00.000Z",
                grace_period_expires_date: "2026-08-24T12:00:00.000Z",
              },
            },
          },
        },
        NOW,
      ),
    ).toEqual({
      plan: "plus",
      planExpiresAt: "2026-08-24T12:00:00.000Z",
    });
  });

  it("prefers Pro over Plus and preserves lifetime access", () => {
    expect(
      revenueCatPlanFromCustomerInfo(
        {
          subscriber: {
            entitlements: {
              plus: { expires_date: "2026-09-22T12:00:00.000Z" },
              premium: { expires_date: null },
            },
          },
        },
        NOW,
      ),
    ).toEqual({ plan: "pro", planExpiresAt: null });
  });

  it("rejects malformed Customer Info instead of revoking an account", () => {
    expect(() => revenueCatPlanFromCustomerInfo({}, NOW)).toThrow(
      "did not include entitlements",
    );
  });
});

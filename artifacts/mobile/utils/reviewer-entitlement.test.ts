/**
 * @fileOverview Verification role: proves the Play reviewer receives only the intended mobile tier override.
 * System connection: guards the pure helper consumed by PurchasesContext, so
 * ad suppression and the plan screen agree before RevenueCat finishes loading.
 */
import { describe, expect, it } from "vitest";
import {
  GOOGLE_PLAY_REVIEW_EMAIL,
  reviewerSubscriptionTier,
} from "./reviewer-entitlement";

describe("reviewerSubscriptionTier", () => {
  it("grants Institutional to the exact review mailbox", () => {
    expect(reviewerSubscriptionTier(GOOGLE_PLAY_REVIEW_EMAIL)).toBe(
      "institutional",
    );
    expect(reviewerSubscriptionTier(" REVIEW@CASPAREL.COM ")).toBe(
      "institutional",
    );
  });

  it("does not grant a tier to similar or missing addresses", () => {
    expect(reviewerSubscriptionTier("reviewer@casparel.com")).toBeNull();
    expect(reviewerSubscriptionTier("support@casparel.com")).toBeNull();
    expect(reviewerSubscriptionTier(null)).toBeNull();
  });
});

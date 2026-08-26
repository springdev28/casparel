/**
 * @fileOverview Mobile entitlement role: identifies the dedicated Google Play review account.
 * System connection: PurchasesContext uses this presentation-only exception
 * while the API independently enforces the same account's Institutional plan.
 */
import type { SubscriptionTier } from "./revenuecat";

export const GOOGLE_PLAY_REVIEW_EMAIL = "review@casparel.com";

/**
 * The reviewer seat is provisioned by Casparel rather than purchased through
 * Google Play, so RevenueCat CustomerInfo may legitimately contain no store
 * entitlement. Returning Institutional here keeps the paywall and ad gate in
 * sync with the server. It grants no API access by itself.
 */
export function reviewerSubscriptionTier(
  email: string | null | undefined,
): SubscriptionTier | null {
  return email?.trim().toLowerCase() === GOOGLE_PLAY_REVIEW_EMAIL
    ? "institutional"
    : null;
}

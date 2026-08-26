/**
 * @fileOverview Mobile UI role: suppresses the Android-only sponsored placement elsewhere.
 * System connection: Dashboard imports one stable component name; Metro swaps
 * in SponsoredLearningResourceCard.android.tsx only for the Android bundle.
 */

/** iOS and web are intentionally ad-free in the current product policy. */
export function SponsoredLearningResourceCard() {
  return null;
}

/**
 * @fileOverview Mobile UI role: suppresses the Android-only sponsored placement elsewhere.
 * System connection: the hosted-app shell imports one stable component name;
 * Metro swaps in SponsoredLearningResourceCard.android.tsx on Android.
 */

/** iOS and web are intentionally ad-free in the current product policy. */
export function SponsoredLearningResourceCard(_props: {
  placementId?: string;
  onDismiss?: () => void;
}) {
  return null;
}

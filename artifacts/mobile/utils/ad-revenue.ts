/**
 * @fileOverview Mobile monetization role: normalizes AdMob callback values for RevenueCat Ads.
 * System connection: the Android sponsored card uses these pure conversions
 * before passing impression revenue and load failures to Purchases.adTracker.
 */

export type RevenueCatAdPrecision =
  "exact" | "estimated" | "publisher_defined" | "unknown";

/**
 * AdMob's numeric values are 0 unknown, 1 estimated, 2 publisher-provided,
 * and 3 precise. RevenueCat uses strings, with a different name for value 2.
 */
export function toRevenueCatPrecision(
  precision: number,
): RevenueCatAdPrecision {
  if (precision === 3) return "exact";
  if (precision === 2) return "publisher_defined";
  if (precision === 1) return "estimated";
  return "unknown";
}

/** RevenueCat only accepts an integer mediator error code, not AdMob strings. */
export function numericAdErrorCode(value: unknown): number | undefined {
  const candidate =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isInteger(candidate) ? candidate : undefined;
}

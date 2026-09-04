/**
 * @fileOverview Android monetization role: forwards AdMob lifecycle events to RevenueCat Ads.
 * System connection: SponsoredLearningResourceCard owns the AdMob object and
 * calls these best-effort helpers; the existing PurchasesProvider configures
 * and identifies the same RevenueCat SDK instance used for subscriptions.
 */
import { numericAdErrorCode, toRevenueCatPrecision } from "@/utils/ad-revenue";
import { loadPurchases, type PurchasesModule } from "@/utils/revenuecat";

export const DASHBOARD_SPONSORED_PLACEMENT = "dashboard_sponsored_resource";

const common = (adUnitId: string, impressionId: string) => ({
  mediatorName: "AdMob",
  adFormat: "native",
  placement: DASHBOARD_SPONSORED_PLACEMENT,
  adUnitId,
  impressionId,
});

type AdEvent = ReturnType<typeof common>;
type AdRevenueEvent = AdEvent & {
  revenueMicros: number;
  currency: string;
  precision: ReturnType<typeof toRevenueCatPrecision>;
};
type AdFailureEvent = {
  mediatorName: string;
  adFormat: string;
  placement: string;
  adUnitId: string;
  mediatorErrorCode?: number;
};
type PurchasesAdTracker = {
  trackAdLoaded(data: AdEvent): Promise<void>;
  trackAdDisplayed(data: AdEvent): Promise<void>;
  trackAdOpened(data: AdEvent): Promise<void>;
  trackAdRevenue(data: AdRevenueEvent): Promise<void>;
  trackAdFailedToLoad(data: AdFailureEvent): Promise<void>;
};

/**
 * Reuse the lazy RevenueCat loader used by purchases. A static import of the
 * native package would make this Android component crash in Expo Go before it
 * gets a chance to decide that native ads are unavailable.
 */
async function loadAdTracker(): Promise<PurchasesAdTracker | null> {
  const purchases = (await loadPurchases()) as
    | (PurchasesModule & { adTracker?: PurchasesAdTracker })
    | null;
  return purchases?.adTracker ?? null;
}

/** RevenueCat Ads is experimental, so analytics can never own the UI path. */
async function bestEffort(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch {
    // The AdMob creative remains valid if RevenueCat Ads is disabled or down.
  }
}

export function trackSponsoredAdLoaded(adUnitId: string, impressionId: string) {
  return bestEffort(async () => {
    await (await loadAdTracker())?.trackAdLoaded(common(adUnitId, impressionId));
  });
}

export function trackSponsoredAdDisplayed(
  adUnitId: string,
  impressionId: string,
) {
  return bestEffort(async () => {
    await (await loadAdTracker())?.trackAdDisplayed(
      common(adUnitId, impressionId),
    );
  });
}

export function trackSponsoredAdOpened(adUnitId: string, impressionId: string) {
  return bestEffort(async () => {
    await (await loadAdTracker())?.trackAdOpened(common(adUnitId, impressionId));
  });
}

export function trackSponsoredAdRevenue(
  adUnitId: string,
  impressionId: string,
  paid: { value: number; currency: string; precision: number },
) {
  return bestEffort(async () => {
    await (await loadAdTracker())?.trackAdRevenue({
      ...common(adUnitId, impressionId),
      // react-native-google-mobile-ads normalizes AdValue.valueMicros into
      // major currency units; RevenueCat's bridge expects micros again.
      revenueMicros: Math.round(paid.value * 1_000_000),
      currency: paid.currency,
      precision: toRevenueCatPrecision(paid.precision),
    });
  });
}

export function trackSponsoredAdFailed(adUnitId: string, errorCode?: unknown) {
  return bestEffort(async () => {
    await (await loadAdTracker())?.trackAdFailedToLoad({
      mediatorName: "AdMob",
      adFormat: "native",
      placement: DASHBOARD_SPONSORED_PLACEMENT,
      adUnitId,
      mediatorErrorCode: numericAdErrorCode(errorCode),
    });
  });
}

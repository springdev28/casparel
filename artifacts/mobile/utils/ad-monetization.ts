import Purchases, {
  AdFormat,
  AdMediatorName,
  AdRevenuePrecision,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import { RevenuePrecisions } from 'react-native-google-mobile-ads';

export const DASHBOARD_SPONSORED_PLACEMENT = 'dashboard_sponsored_resource';

export const dashboardNativeAdUnitId: string | null =
  Platform.select({
    android: process.env.EXPO_PUBLIC_ADMOB_ANDROID_DASHBOARD_NATIVE_AD_UNIT_ID,
    ios: process.env.EXPO_PUBLIC_ADMOB_IOS_DASHBOARD_NATIVE_AD_UNIT_ID,
    default: undefined,
  }) ?? null;

function rcPrecision(precision: RevenuePrecisions): AdRevenuePrecision {
  switch (precision) {
    case RevenuePrecisions.PRECISE:
      return AdRevenuePrecision.exact;
    case RevenuePrecisions.ESTIMATED:
      return AdRevenuePrecision.estimated;
    case RevenuePrecisions.PUBLISHER_PROVIDED:
      return AdRevenuePrecision.publisherDefined;
    default:
      return AdRevenuePrecision.unknown;
  }
}

const common = (adUnitId: string, impressionId: string) => ({
  mediatorName: AdMediatorName.adMob,
  adFormat: AdFormat.native,
  placement: DASHBOARD_SPONSORED_PLACEMENT,
  adUnitId,
  impressionId,
});

/**
 * RevenueCat Ads is currently experimental. Monetization must never make the
 * dashboard fail, so every tracker call is best-effort and deliberately
 * isolated from the rendering path.
 */
export async function trackSponsoredAdLoaded(adUnitId: string, impressionId: string) {
  try {
    await Purchases.adTracker.trackAdLoaded(common(adUnitId, impressionId));
  } catch {
    // Ads still work when RevenueCat Ads beta is not enabled for the project.
  }
}

export async function trackSponsoredAdDisplayed(adUnitId: string, impressionId: string) {
  try {
    await Purchases.adTracker.trackAdDisplayed(common(adUnitId, impressionId));
  } catch {
    // Best-effort analytics only.
  }
}

export async function trackSponsoredAdOpened(adUnitId: string, impressionId: string) {
  try {
    await Purchases.adTracker.trackAdOpened(common(adUnitId, impressionId));
  } catch {
    // Best-effort analytics only.
  }
}

export async function trackSponsoredAdRevenue(
  adUnitId: string,
  impressionId: string,
  paid: { value: number; currency: string; precision: RevenuePrecisions },
) {
  try {
    await Purchases.adTracker.trackAdRevenue({
      ...common(adUnitId, impressionId),
      revenueMicros: Math.round(paid.value * 1_000_000),
      currency: paid.currency,
      precision: rcPrecision(paid.precision),
    });
  } catch {
    // Best-effort analytics only.
  }
}

export async function trackSponsoredAdFailed(adUnitId: string, errorCode?: string | number) {
  try {
    await Purchases.adTracker.trackAdFailedToLoad({
      mediatorName: AdMediatorName.adMob,
      adFormat: AdFormat.native,
      placement: DASHBOARD_SPONSORED_PLACEMENT,
      adUnitId,
      mediatorErrorCode: errorCode == null ? undefined : String(errorCode),
    });
  } catch {
    // Best-effort analytics only.
  }
}

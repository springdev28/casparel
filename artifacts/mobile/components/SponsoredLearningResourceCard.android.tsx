/**
 * @fileOverview Android UI role: renders the free-tier dashboard's single native sponsored card.
 * System connection: AdMob supplies and registers the creative, AdsContext
 * supplies the UMP gate, PurchasesContext suppresses paid accounts, and
 * revenuecat-ads forwards lifecycle/revenue callbacks for unified reporting.
 */
import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import type { NativeAd } from "react-native-google-mobile-ads";
import { useColors } from "@workspace/edu-ds/hooks/use-colors";
import { useAds } from "@/contexts/AdsContext";
import { usePurchases } from "@/contexts/PurchasesContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  trackSponsoredAdDisplayed,
  trackSponsoredAdFailed,
  trackSponsoredAdLoaded,
  trackSponsoredAdOpened,
  trackSponsoredAdRevenue,
} from "@/utils/revenuecat-ads";
import {
  loadGoogleMobileAds,
  type GoogleMobileAdsModule,
} from "@/utils/google-mobile-ads";

const productionAdUnitId =
  process.env.EXPO_PUBLIC_ADMOB_ANDROID_DASHBOARD_NATIVE_AD_UNIT_ID ?? null;

type NativePaidEvent = {
  value: number;
  precision: number;
  // The native bridge emits `currency`; its current generated type calls the
  // same field `currencyCode`, so accepting both protects both architectures.
  currency?: string;
  currencyCode?: string;
};

function adUnitForThisBuild(ads: GoogleMobileAdsModule): string | null {
  return __DEV__ ? ads.TestIds.NATIVE : productionAdUnitId;
}

export function SponsoredLearningResourceCard() {
  const { t } = useLanguage();
  const colors = useColors();
  const { ready: adsReady, canRequestAds } = useAds();
  const {
    ready: purchasesReady,
    available: purchasesAvailable,
    isPremium,
  } = usePurchases();
  const [creative, setCreative] = useState<{
    nativeAd: NativeAd;
    ads: GoogleMobileAdsModule;
  } | null>(null);

  useEffect(() => {
    // A paid subscriber must never see an ad while RevenueCat is loading or
    // degraded. Requiring `available` makes an entitlement outage fail closed.
    if (
      !adsReady ||
      !canRequestAds ||
      !purchasesReady ||
      !purchasesAvailable ||
      isPremium
    ) {
      return;
    }

    let cancelled = false;
    let loadedAd: NativeAd | null = null;
    let requestedAdUnitId: string | null = null;

    void loadGoogleMobileAds()
      .then(async (ads) => {
        if (!ads || cancelled) return null;
        const adUnitId = adUnitForThisBuild(ads);
        if (!adUnitId) return null;
        requestedAdUnitId = adUnitId;

        const ad = await ads.NativeAd.createForAdRequest(adUnitId, {
          // UMP/TFUA is the privacy gate; this request flag independently
          // ensures the creative is not behaviorally personalized.
          requestNonPersonalizedAdsOnly: true,
          aspectRatio: ads.NativeMediaAspectRatio.LANDSCAPE,
          keywords: [
            "education",
            "learning",
            "study",
            "school",
            "books",
            "courses",
          ],
        });

        if (cancelled) {
          ad.destroy();
          return null;
        }

        loadedAd = ad;

        // Register callbacks before React paints the NativeAdView so a very
        // fast first impression cannot outrun RevenueCat tracking.
        ad.addAdEventListener(ads.NativeAdEventType.IMPRESSION, () => {
          void trackSponsoredAdDisplayed(adUnitId, ad.responseId);
        });
        ad.addAdEventListener(ads.NativeAdEventType.CLICKED, () => {
          void trackSponsoredAdOpened(adUnitId, ad.responseId);
        });
        ad.addAdEventListener(ads.NativeAdEventType.PAID, (payload) => {
          const paid = payload as NativePaidEvent;
          const currency = paid.currency ?? paid.currencyCode;
          if (!currency) return;
          void trackSponsoredAdRevenue(adUnitId, ad.responseId, {
            value: paid.value,
            currency,
            precision: paid.precision,
          });
        });

        void trackSponsoredAdLoaded(adUnitId, ad.responseId);
        setCreative({ nativeAd: ad, ads });
        return ad;
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? (error as { code?: unknown }).code
            : undefined;
        if (requestedAdUnitId) {
          void trackSponsoredAdFailed(requestedAdUnitId, code);
        }
      });

    return () => {
      cancelled = true;
      loadedAd?.destroy();
      setCreative(null);
    };
  }, [adsReady, canRequestAds, isPremium, purchasesAvailable, purchasesReady]);

  if (
    !adsReady ||
    !canRequestAds ||
    !purchasesReady ||
    !purchasesAvailable ||
    isPremium ||
    !creative
  ) {
    return null;
  }

  const { nativeAd, ads } = creative;
  const NativeAdView = ads.NativeAdView;
  const NativeAsset = ads.NativeAsset;
  const NativeMediaView = ads.NativeMediaView;
  const NativeAssetType = ads.NativeAssetType;

  return (
    <View style={styles.wrapper}>
      <NativeAdView nativeAd={nativeAd}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: colors.radius,
            },
          ]}
          accessibilityLabel={t("Sponsored learning resource advertisement")}
        >
          {/* Google inserts AdChoices in a corner. This row and the extra top
              padding leave that overlay visible and make attribution explicit. */}
          <View style={styles.labelRow}>
            <Text
              style={[
                styles.sponsoredLabel,
                {
                  color: colors.mutedForeground,
                  fontFamily: colors.fontFamily.sansSemiBold,
                },
              ]}
            >
              {t("Sponsored learning resource")}
            </Text>
            <Text
              style={[
                styles.adBadge,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  fontFamily: colors.fontFamily.sansSemiBold,
                },
              ]}
            >
              {t("AD")}
            </Text>
          </View>

          <View style={styles.headingRow}>
            {nativeAd.icon ? (
              <NativeAsset assetType={NativeAssetType.ICON}>
                <Image
                  source={{ uri: nativeAd.icon.url }}
                  style={styles.icon}
                />
              </NativeAsset>
            ) : null}

            <View style={styles.headingCopy}>
              <NativeAsset assetType={NativeAssetType.HEADLINE}>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.headline,
                    {
                      color: colors.foreground,
                      fontFamily: colors.fontFamily.sansSemiBold,
                    },
                  ]}
                >
                  {nativeAd.headline}
                </Text>
              </NativeAsset>

              {nativeAd.advertiser ? (
                <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.advertiser,
                      {
                        color: colors.mutedForeground,
                        fontFamily: colors.fontFamily.sans,
                      },
                    ]}
                  >
                    {nativeAd.advertiser}
                  </Text>
                </NativeAsset>
              ) : null}
            </View>
          </View>

          {/* NativeMediaView, unlike a normal Image, lets Google register and
              control the ad's image/video asset under the native-ad policy. */}
          <NativeMediaView resizeMode="cover" style={styles.media} />

          {nativeAd.body ? (
            <NativeAsset assetType={NativeAssetType.BODY}>
              <Text
                numberOfLines={3}
                style={[
                  styles.body,
                  {
                    color: colors.mutedForeground,
                    fontFamily: colors.fontFamily.sans,
                  },
                ]}
              >
                {nativeAd.body}
              </Text>
            </NativeAsset>
          ) : null}

          {nativeAd.callToAction ? (
            <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
              <Text
                style={[
                  styles.cta,
                  {
                    color: colors.primaryForeground,
                    backgroundColor: colors.primary,
                    borderRadius: Math.max(6, colors.radius - 2),
                    fontFamily: colors.fontFamily.sansSemiBold,
                  },
                ]}
              >
                {nativeAd.callToAction}
              </Text>
            </NativeAsset>
          ) : null}
        </View>
      </NativeAdView>

      <Text
        style={[
          styles.disclosure,
          { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
        ]}
      >
        {t(
          "Paid placement. Sponsorship does not affect Casparel resource rankings or credibility scores.",
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginVertical: 8, gap: 6 },
  card: {
    borderWidth: 1,
    padding: 14,
    paddingTop: 26,
    gap: 10,
    overflow: "hidden",
  },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sponsoredLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  adBadge: {
    fontSize: 9,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  headingRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  icon: { width: 44, height: 44, borderRadius: 9 },
  headingCopy: { flex: 1, gap: 2 },
  headline: { fontSize: 15, lineHeight: 20 },
  advertiser: { fontSize: 11 },
  media: { width: "100%", minHeight: 132, borderRadius: 8 },
  body: { fontSize: 12, lineHeight: 17 },
  cta: {
    alignSelf: "flex-start",
    overflow: "hidden",
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  disclosure: { fontSize: 10, lineHeight: 14 },
});

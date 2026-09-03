/**
 * @fileOverview Android UI role: renders a compact, scrollable sponsored section.
 * System connection: AdMob supplies and registers the creative, AdsContext
 * supplies consent and saved sound/ad preferences, and
 * revenuecat-ads forwards lifecycle/revenue callbacks for unified reporting.
 */
import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { NativeAd } from "react-native-google-mobile-ads";
import { useColors } from "@workspace/edu-ds/hooks/use-colors";
import { useAds } from "@/contexts/AdsContext";
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
  const {
    ready: adsReady,
    canRequestAds,
    soundMuted,
    setSoundMuted,
  } = useAds();
  const [requestNonce, setRequestNonce] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [creative, setCreative] = useState<{
    nativeAd: NativeAd;
    ads: GoogleMobileAdsModule;
  } | null>(null);

  useEffect(() => {
    if (!adsReady || !canRequestAds || dismissed) return;

    let cancelled = false;
    let loadedAd: NativeAd | null = null;
    let requestedAdUnitId: string | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

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
          startVideoMuted: soundMuted,
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
        ad.addAdEventListener(ads.NativeAdEventType.VIDEO_MUTED, () => {
          void setSoundMuted(true);
        });
        ad.addAdEventListener(ads.NativeAdEventType.VIDEO_UNMUTED, () => {
          void setSoundMuted(false);
        });
        ad.addAdEventListener(ads.NativeAdEventType.VIDEO_ENDED, () => {
          if (cancelled) return;
          setCreative(null);
          setRequestNonce((value) => value + 1);
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
        retryTimer = setTimeout(() => {
          if (!cancelled) setRequestNonce((value) => value + 1);
        }, 30_000);
      });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      loadedAd?.destroy();
      setCreative(null);
    };
  }, [adsReady, canRequestAds, dismissed, requestNonce, setSoundMuted, soundMuted]);

  if (!adsReady || !canRequestAds || dismissed) {
    return null;
  }

  if (!creative) {
    return (
      <View style={[styles.loadingCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[styles.loadingLabel, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold }]}>
          {t("Sponsored learning resource")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Dismiss advertisement")}
          onPress={() => setDismissed(true)}
          hitSlop={8}
        >
          <Feather name="x" size={17} color={colors.mutedForeground} />
        </Pressable>
      </View>
    );
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                soundMuted ? "Turn ad sound on" : "Mute ads",
              )}
              hitSlop={8}
              onPress={() => void setSoundMuted(!soundMuted)}
              style={styles.soundButton}
            >
              <Feather
                name={soundMuted ? "volume-x" : "volume-2"}
                size={16}
                color={colors.foreground}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("Dismiss advertisement")}
              hitSlop={8}
              onPress={() => setDismissed(true)}
              style={styles.dismissButton}
            >
              <Feather name="x" size={17} color={colors.foreground} />
            </Pressable>
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
                numberOfLines={2}
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
  wrapper: { marginVertical: 5, gap: 3 },
  loadingCard: {
    minHeight: 48,
    marginVertical: 5,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  loadingLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7 },
  card: {
    borderWidth: 1,
    padding: 10,
    paddingTop: 20,
    gap: 7,
    overflow: "hidden",
  },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 7 },
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
  soundButton: { marginLeft: "auto", padding: 3 },
  dismissButton: { padding: 3 },
  headingRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  icon: { width: 36, height: 36, borderRadius: 8 },
  headingCopy: { flex: 1, gap: 2 },
  headline: { fontSize: 14, lineHeight: 18 },
  advertiser: { fontSize: 11 },
  media: { width: "100%", height: 96, borderRadius: 7 },
  body: { fontSize: 11, lineHeight: 15 },
  cta: {
    alignSelf: "flex-start",
    overflow: "hidden",
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  disclosure: { fontSize: 9, lineHeight: 12 },
});

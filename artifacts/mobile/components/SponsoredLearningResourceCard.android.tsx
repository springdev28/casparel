/**
 * @fileOverview Android UI role: renders a compact, scrollable sponsored section.
 * System connection: AdMob supplies and registers the creative, AdsContext
 * supplies consent and saved sound/ad preferences, and
 * revenuecat-ads forwards lifecycle/revenue callbacks for unified reporting.
 */
import React, { useEffect, useRef, useState } from "react";
import { AppState, Image, Pressable, StyleSheet, Text, View } from "react-native";
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
import { AdRotation } from "@/utils/ad-rotation";
import { ADMOB_NO_FILL_CODE, logAdDiagnostic } from "@/utils/ad-diagnostics";

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

export function SponsoredLearningResourceCard({
  placementId = 'default',
  visible = true,
  onAvailabilityChange,
  onHeightChange,
}: {
  placementId?: string;
  visible?: boolean;
  onAvailabilityChange?: (ready: boolean) => void;
  onHeightChange?: (height: number) => void;
}) {
  const { t } = useLanguage();
  const colors = useColors();
  const {
    ready: adsReady,
    canRequestAds,
    soundMuted,
    setSoundMuted,
  } = useAds();
  const setSoundMutedRef = useRef(setSoundMuted);
  setSoundMutedRef.current = setSoundMuted;
  const soundMutedRef = useRef(soundMuted);
  soundMutedRef.current = soundMuted;
  type Creative = { nativeAd: NativeAd; ads: GoogleMobileAdsModule; muted: boolean; destroy(): void };
  const [creative, setCreative] = useState<Creative | null>(null);
  const rotation = useRef<AdRotation<Creative> | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const active = visible && foreground;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => { rotation.current?.setVisible(active); }, [active]);
  useEffect(() => { rotation.current?.releaseRetired(); }, [creative]);
  useEffect(() => {
    onAvailabilityChange?.(creative !== null && canRequestAds);
  }, [creative, canRequestAds, onAvailabilityChange]);
  useEffect(() => () => onAvailabilityChange?.(false), [onAvailabilityChange]);

  useEffect(() => {
    if (!adsReady || !canRequestAds) return;
    logAdDiagnostic('placement-mounted', { placement: 'inline' });
    const queue = new AdRotation<Creative>(async () => {
      const ads = await loadGoogleMobileAds();
      if (!ads) throw new Error('AD_SDK_UNAVAILABLE');
      const unit = adUnitForThisBuild(ads);
      if (!unit) throw new Error('AD_UNIT_UNAVAILABLE');
      const muted = soundMutedRef.current;
      logAdDiagnostic('ad-requested', { placement: 'inline' });
      const ad = await ads.NativeAd.createForAdRequest(unit, {
        requestNonPersonalizedAdsOnly: true,
        startVideoMuted: muted,
        aspectRatio: ads.NativeMediaAspectRatio.LANDSCAPE,
        keywords: ['education', 'learning', 'study', 'school', 'books', 'courses'],
      });
      const loaded: Creative = { nativeAd: ad, ads, muted, destroy: () => ad.destroy() };
      ad.addAdEventListener(ads.NativeAdEventType.IMPRESSION, () => {
        logAdDiagnostic('ad-displayed', { placement: 'inline' });
        void trackSponsoredAdDisplayed(unit, ad.responseId);
      });
      ad.addAdEventListener(ads.NativeAdEventType.CLICKED, () => {
        void trackSponsoredAdOpened(unit, ad.responseId);
      });
      ad.addAdEventListener(ads.NativeAdEventType.PAID, payload => {
        const paid = payload as NativePaidEvent;
        const currency = paid.currency ?? paid.currencyCode;
        if (currency) void trackSponsoredAdRevenue(unit, ad.responseId, { value: paid.value, currency, precision: paid.precision });
      });
      let played = false;
      ad.addAdEventListener(ads.NativeAdEventType.VIDEO_PLAYED, () => { played = true; });
      const rememberMute = (muted: boolean) => {
        // Only the displayed video's controls may update Settings; startup
        // callbacks from a prefetched creative must not overwrite a choice.
        if (queue.current !== loaded || !played || loaded.muted === muted) return;
        loaded.muted = muted;
        soundMutedRef.current = muted;
        queue.discardPreload();
        void setSoundMutedRef.current(muted);
      };
      ad.addAdEventListener(ads.NativeAdEventType.VIDEO_MUTED, () => rememberMute(true));
      ad.addAdEventListener(ads.NativeAdEventType.VIDEO_UNMUTED, () => rememberMute(false));
      ad.addAdEventListener(ads.NativeAdEventType.VIDEO_ENDED, () => {
        if (queue.current === loaded) queue.advance();
      });
      void trackSponsoredAdLoaded(unit, ad.responseId);
      logAdDiagnostic('ad-loaded', { placement: 'inline' });
      return loaded;
    }, setCreative, error => {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      // Keep provider messages/identifiers out of logs, but retain the finite
      // error category needed to distinguish a network problem from no fill.
      const reason = typeof code === 'string' && /^googleMobileAds\/(?:internal-error|invalid-request|network-error|no-fill|mediation-no-fill|app-id-missing|request-id-mismatch|invalid-ad-string)$/.test(code)
        ? code.slice('googleMobileAds/'.length)
        : error instanceof Error && ['AD_REQUEST_TIMEOUT', 'AD_SDK_UNAVAILABLE', 'AD_UNIT_UNAVAILABLE'].includes(error.message)
          ? error.message.toLowerCase()
          : 'unknown';
      logAdDiagnostic(code === ADMOB_NO_FILL_CODE ? 'ad-no-fill' : 'ad-request-failed', { reason });
      if (productionAdUnitId) void trackSponsoredAdFailed(productionAdUnitId, code);
    });
    rotation.current = queue;
    queue.setVisible(activeRef.current);
    queue.start();
    return () => { rotation.current = null; queue.stop(); setCreative(null); };
  }, [adsReady, canRequestAds, placementId]);

  useEffect(() => {
    // Native video does not support MobileAds.setAppMuted. Stop the current
    // creative and request its replacement using Google's startVideoMuted.
    if (creative && creative.muted !== soundMuted) rotation.current?.resetSound();
  }, [soundMuted, creative]);

  if (!adsReady || !canRequestAds || !creative) return null;

  const { nativeAd, ads } = creative;
  const NativeAdView = ads.NativeAdView;
  const NativeAsset = ads.NativeAsset;
  const NativeMediaView = ads.NativeMediaView;
  const NativeAssetType = ads.NativeAssetType;

  return (
    <View style={styles.wrapper} onLayout={event => onHeightChange?.(Math.ceil(event.nativeEvent.layout.height + 10))}>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            soundMuted ? t("Turn ad sound on") : t("Mute ads")
          }
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
          accessibilityLabel={t("Close this ad and show the next")}
          hitSlop={8}
          onPress={() => rotation.current?.advance()}
          style={styles.dismissButton}
        >
          <Feather name="x" size={17} color={colors.foreground} />
        </Pressable>
      </View>
      <NativeAdView key={nativeAd.responseId} nativeAd={nativeAd}>
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
          <NativeMediaView resizeMode="contain" style={styles.media} />

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
  card: {
    borderWidth: 1,
    padding: 10,
    paddingTop: 20,
    gap: 7,
    overflow: "hidden",
  },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  sponsoredLabel: {
    flex: 1,
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
  controls: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  soundButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  dismissButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headingRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  icon: { width: 36, height: 36, borderRadius: 8 },
  headingCopy: { flex: 1, gap: 2 },
  headline: { fontSize: 14, lineHeight: 18 },
  advertiser: { fontSize: 11 },
  media: { width: "100%", height: 120, borderRadius: 7 },
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

import React, { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import {
  MaxAdContentRating,
  NativeAd,
  NativeAdEventType,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  TestIds,
  mobileAds,
  type PaidEvent,
} from 'react-native-google-mobile-ads';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { usePurchases } from '@/contexts/PurchasesContext';
import {
  dashboardNativeAdUnitId,
  trackSponsoredAdDisplayed,
  trackSponsoredAdFailed,
  trackSponsoredAdLoaded,
  trackSponsoredAdOpened,
  trackSponsoredAdRevenue,
} from '@/utils/ad-monetization';

let adsInitialization: Promise<unknown> | null = null;

function initializeAds() {
  if (adsInitialization) return adsInitialization;

  adsInitialization = mobileAds()
    .setRequestConfiguration({
      // Casparel is an education product used by students. Keep the global ad
      // surface conservative even when a teacher is the current account.
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: true,
      testDeviceIdentifiers: __DEV__ ? ['EMULATOR'] : [],
    })
    .then(() => mobileAds().initialize());

  return adsInitialization;
}

function adUnitForThisBuild(): string | null {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  if (__DEV__) return TestIds.NATIVE;
  return dashboardNativeAdUnitId;
}

export function SponsoredLearningResourceCard() {
  const colors = useColors();
  const { ready: purchasesReady, isPremium } = usePurchases();
  const [nativeAd, setNativeAd] = useState<NativeAd | null>(null);

  useEffect(() => {
    // Never flash an ad while RevenueCat is still deciding whether the account
    // is paid. Paid plans are ad-free by construction.
    if (!purchasesReady || isPremium) return;

    const adUnitId = adUnitForThisBuild();
    if (!adUnitId) return;

    let cancelled = false;
    let loadedAd: NativeAd | null = null;

    void initializeAds()
      .then(() =>
        NativeAd.createForAdRequest(adUnitId, {
          requestNonPersonalizedAdsOnly: true,
          keywords: [
            'education',
            'learning',
            'study',
            'school',
            'courses',
            'books',
            'tutoring',
          ],
        }),
      )
      .then((ad) => {
        if (cancelled) {
          ad.destroy();
          return;
        }

        loadedAd = ad;
        setNativeAd(ad);
        void trackSponsoredAdLoaded(adUnitId, ad.responseId);

        ad.addAdEventListener(NativeAdEventType.IMPRESSION, () => {
          void trackSponsoredAdDisplayed(adUnitId, ad.responseId);
        });
        ad.addAdEventListener(NativeAdEventType.CLICKED, () => {
          void trackSponsoredAdOpened(adUnitId, ad.responseId);
        });
        ad.addAdEventListener(NativeAdEventType.PAID, (paid: PaidEvent) => {
          void trackSponsoredAdRevenue(adUnitId, ad.responseId, paid);
        });
      })
      .catch((error: unknown) => {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code?: unknown }).code ?? '')
            : undefined;
        void trackSponsoredAdFailed(adUnitId, code);
      });

    return () => {
      cancelled = true;
      if (loadedAd) loadedAd.destroy();
      setNativeAd(null);
    };
  }, [purchasesReady, isPremium]);

  if (!purchasesReady || isPremium || !nativeAd) return null;

  return (
    <View style={styles.wrapper} accessibilityLabel="Sponsored learning resource advertisement">
      <View style={styles.labelRow}>
        <Text
          style={[
            styles.sponsoredLabel,
            { color: colors.mutedForeground, fontFamily: colors.fontFamily.sansSemiBold },
          ]}
        >
          Sponsored learning resource
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
          AD
        </Text>
      </View>

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
        >
          <View style={styles.row}>
            {nativeAd.icon ? (
              <NativeAsset assetType={NativeAssetType.ICON}>
                <Image source={{ uri: nativeAd.icon.url }} style={styles.icon} />
              </NativeAsset>
            ) : null}

            <View style={styles.copy}>
              <NativeAsset assetType={NativeAssetType.HEADLINE}>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.headline,
                    { color: colors.foreground, fontFamily: colors.fontFamily.sansSemiBold },
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
                      { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
                    ]}
                  >
                    {nativeAd.advertiser}
                  </Text>
                </NativeAsset>
              ) : null}
            </View>
          </View>

          {nativeAd.body ? (
            <NativeAsset assetType={NativeAssetType.BODY}>
              <Text
                numberOfLines={3}
                style={[
                  styles.body,
                  { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans },
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
                    color: colors.primary,
                    borderColor: colors.primary + '55',
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
        Paid placement. Sponsorship does not affect Casparel resource rankings or credibility scores.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginVertical: 8, gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sponsoredLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7 },
  adBadge: { fontSize: 9, borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  card: { borderWidth: 1, padding: 14, gap: 10 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  icon: { width: 42, height: 42, borderRadius: 9 },
  copy: { flex: 1, gap: 2 },
  headline: { fontSize: 15, lineHeight: 20 },
  advertiser: { fontSize: 11 },
  body: { fontSize: 12, lineHeight: 17 },
  cta: { alignSelf: 'flex-start', fontSize: 12, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  disclosure: { fontSize: 10, lineHeight: 14 },
});

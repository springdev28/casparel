import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useGetMyUsage } from '@workspace/api-client-react';
import { useColors } from '@workspace/edu-ds/hooks/use-colors';
import { useAuth } from '@/contexts/AuthContext';
import { usePurchases } from '@/contexts/PurchasesContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { mayShowProgrammaticAd } from '@/utils/ad-policy';

type AdsModule = typeof import('react-native-google-mobile-ads');
let adSdkReady: Promise<AdsModule | null> | null = null;

function prepareRestrictedAds(): Promise<AdsModule | null> {
  if (adSdkReady) return adSdkReady;
  adSdkReady = (async () => {
    try {
      // Expo Go does not carry this native SDK. Load it only for an eligible
      // account so an absent native module degrades to no ad, not an app crash.
      const ads = await import('react-native-google-mobile-ads');
      // UMP decides whether a regional consent form is required. Casparel
      // signals an under-age audience and never asks for personalized ads.
      const consent = await ads.AdsConsent.gatherConsent({ tagForUnderAgeOfConsent: true });
      if (!consent.canRequestAds) return null;
      await ads.default().setRequestConfiguration({
        maxAdContentRating: ads.MaxAdContentRating.G,
        ageRestrictedTreatment: ads.AgeRestrictedTreatment.CHILD,
      });
      await ads.default().initialize();
      return ads;
    } catch {
      return null;
    }
  })();
  return adSdkReady;
}

/** The only native programmatic placement: one stable dashboard banner. */
export function ProgrammaticAd() {
  const { t } = useLanguage();
  const colors = useColors();
  const { user } = useAuth();
  const {
    tier: revenueCatTier,
    ready: purchasesReady,
    customerInfo,
  } = usePurchases();
  const { data: usage } = useGetMyUsage();
  const [ads, setAds] = useState<AdsModule | null>(null);
  const [failed, setFailed] = useState(false);

  const eligible = mayShowProgrammaticAd({
    platform: Platform.OS,
    accountRole: user?.role,
    serverTier: usage?.tier,
    revenueCatTier: purchasesReady && customerInfo ? revenueCatTier : null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!eligible) {
      setAds(null);
      return;
    }
    void prepareRestrictedAds().then((value) => {
      if (!cancelled) setAds(value);
    });
    return () => {
      cancelled = true;
    };
  }, [eligible]);

  if (!eligible || !ads || failed) return null;

  const useTestAds = process.env.EXPO_PUBLIC_ADS_USE_TEST_IDS === 'true';
  const unitId = useTestAds
    ? ads.TestIds.BANNER
    : process.env.EXPO_PUBLIC_ADMOB_ANDROID_DASHBOARD_UNIT_ID;
  if (!unitId) return null;

  return (
    <View
      accessible
      accessibilityLabel={t('Advertisement')}
      style={[styles.slot, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: colors.fontFamily.sans }]}>
        {t('Advertisement')}
      </Text>
      <ads.BannerAd
        unitId={unitId}
        size={ads.BannerAdSize.BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    minHeight: 76,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginVertical: 8,
  },
  label: { fontSize: 10, alignSelf: 'flex-start', marginLeft: 8, marginBottom: 2 },
});

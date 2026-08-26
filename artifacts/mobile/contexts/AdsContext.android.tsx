/**
 * @fileOverview Android state role: gates AdMob initialization on Google UMP consent.
 * System connection: installed by app/_layout.tsx after auth and onboarding;
 * SponsoredLearningResourceCard consumes the request gate, while Profile exposes
 * Google's privacy-options form when the active message requires one.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AdsConsentInfo } from "react-native-google-mobile-ads";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboarding } from "@/contexts/OnboardingContext";
import {
  loadGoogleMobileAds,
  type GoogleMobileAdsModule,
} from "@/utils/google-mobile-ads";

interface AdsContextValue {
  ready: boolean;
  canRequestAds: boolean;
  privacyOptionsRequired: boolean;
  showPrivacyOptions: () => Promise<boolean>;
}

const initialValue: AdsContextValue = {
  ready: false,
  canRequestAds: false,
  privacyOptionsRequired: false,
  showPrivacyOptions: async () => false,
};

const AdsContext = createContext<AdsContextValue>(initialValue);
let sdkInitialization: Promise<unknown> | null = null;

function privacyOptionsRequired(
  ads: GoogleMobileAdsModule,
  info: AdsConsentInfo,
): boolean {
  return (
    info.privacyOptionsRequirementStatus ===
    ads.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED
  );
}

async function initializeSdk(ads: GoogleMobileAdsModule): Promise<void> {
  // Casparel does not currently collect a reliable age/guardian claim. Treat
  // the entire education audience conservatively rather than guessing from a
  // student/teacher role: TFUA and non-personalized requests apply to all ads.
  await ads.default().setRequestConfiguration({
    maxAdContentRating: ads.MaxAdContentRating.PG,
    tagForUnderAgeOfConsent: true,
    testDeviceIdentifiers: __DEV__ ? ["EMULATOR"] : [],
  });

  if (!sdkInitialization) {
    sdkInitialization = ads.default().initialize().catch((error: unknown) => {
      // A transient native initialization failure should not poison every
      // later privacy-options retry for the rest of the process lifetime.
      sdkInitialization = null;
      throw error;
    });
  }
  await sdkInitialization;
}

export function AdsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { ready: onboardingReady, needsOnboarding } = useOnboarding();
  const [ready, setReady] = useState(false);
  const [consentInfo, setConsentInfo] = useState<AdsConsentInfo | null>(null);
  const [adsModule, setAdsModule] = useState<GoogleMobileAdsModule | null>(
    null,
  );

  useEffect(() => {
    // Waiting until onboarding is complete prevents a system consent sheet
    // from interrupting the account-setup screens. No ad surface exists there.
    if (!isAuthenticated || !onboardingReady || needsOnboarding) {
      setReady(false);
      setConsentInfo(null);
      setAdsModule(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      const ads = await loadGoogleMobileAds();
      if (cancelled) return;
      if (!ads) {
        // Expo Go reaches this branch. It remains a usable free-only client,
        // exactly like PurchasesProvider when RevenueCat's bridge is absent.
        setReady(true);
        return;
      }
      setAdsModule(ads);

      let info: AdsConsentInfo | null = null;
      try {
        // UMP refreshes this on every app launch and shows any required form.
        // Do not cache a separate answer: Google's message can expire/change.
        info = await ads.AdsConsent.gatherConsent({
          tagForUnderAgeOfConsent: true,
        });
      } catch {
        // Google's documented fallback is the last UMP state. With no cached
        // state we fail closed, which means an ad outage cannot break Casparel.
        try {
          info = await ads.AdsConsent.getConsentInfo();
        } catch {
          info = null;
        }
      }

      if (cancelled) return;
      setConsentInfo(info);

      if (!info?.canRequestAds) {
        setReady(true);
        return;
      }

      try {
        await initializeSdk(ads);
      } catch {
        // Ads are optional. Keep the dashboard available and leave the gate
        // closed when the native SDK cannot initialize.
        if (!cancelled) setConsentInfo({ ...info, canRequestAds: false });
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, needsOnboarding, onboardingReady]);

  const showPrivacyOptions = useCallback(async (): Promise<boolean> => {
    const ads = adsModule ?? (await loadGoogleMobileAds());
    if (!ads) return false;
    try {
      const info = await ads.AdsConsent.showPrivacyOptionsForm();
      setConsentInfo(info);
      if (info.canRequestAds) await initializeSdk(ads);
      return true;
    } catch {
      return false;
    }
  }, [adsModule]);

  const value = useMemo<AdsContextValue>(
    () => ({
      ready,
      canRequestAds: ready && consentInfo?.canRequestAds === true,
      privacyOptionsRequired:
        adsModule !== null &&
        consentInfo !== null &&
        privacyOptionsRequired(adsModule, consentInfo),
      showPrivacyOptions,
    }),
    [adsModule, consentInfo, ready, showPrivacyOptions],
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds(): AdsContextValue {
  return useContext(AdsContext);
}

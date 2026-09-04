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
import { getGetMyUsageQueryKey, useGetMyUsage } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { usePurchases } from "@/contexts/PurchasesContext";
import { storage } from "@/utils/secure-storage";
import { apiOrigin } from "@/utils/api-host";
import { logAdDiagnostic } from "@/utils/ad-diagnostics";
import {
  loadGoogleMobileAds,
  type GoogleMobileAdsModule,
} from "@/utils/google-mobile-ads";

interface AdsContextValue {
  ready: boolean;
  canRequestAds: boolean;
  soundMuted: boolean;
  adsDisabled: boolean;
  canDisableAds: boolean;
  setSoundMuted: (muted: boolean) => Promise<void>;
  setAdsDisabled: (disabled: boolean) => Promise<boolean>;
  privacyOptionsRequired: boolean;
  showPrivacyOptions: () => Promise<boolean>;
}

const initialValue: AdsContextValue = {
  ready: false,
  canRequestAds: false,
  soundMuted: false,
  adsDisabled: false,
  canDisableAds: false,
  setSoundMuted: async () => {},
  setAdsDisabled: async () => false,
  privacyOptionsRequired: false,
  showPrivacyOptions: async () => false,
};

const AdsContext = createContext<AdsContextValue>(initialValue);
let sdkInitialization: Promise<unknown> | null = null;
const AD_SOUND_MUTED_KEY = "casparel_ad_sound_muted";
const ADS_DISABLED_KEY = "casparel_ads_disabled";

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
    sdkInitialization = ads
      .default()
      .initialize()
      .catch((error: unknown) => {
        // A transient native initialization failure should not poison every
        // later privacy-options retry for the rest of the process lifetime.
        sdkInitialization = null;
        throw error;
      });
  }
  await sdkInitialization;
}

export function AdsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, token } = useAuth();
  const { level } = usePurchases();
  const { ready: onboardingReady, needsOnboarding } = useOnboarding();
  // Entitlement is the wider of the store's answer and the server's: the
  // Review account and Institutional seats hold Pro-level access granted by
  // the server with no RevenueCat subscription behind it.
  const { data: usage } = useGetMyUsage({
    query: { enabled: isAuthenticated, queryKey: getGetMyUsageQueryKey() },
  });
  const [ready, setReady] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [soundMuted, setSoundMutedState] = useState(false);
  const [adsDisabled, setAdsDisabledState] = useState(false);
  const [consentInfo, setConsentInfo] = useState<AdsConsentInfo | null>(null);
  const [adsModule, setAdsModule] = useState<GoogleMobileAdsModule | null>(
    null,
  );
  const canDisableAds =
    level === "pro" ||
    usage?.tier === "pro" ||
    usage?.tier === "institutional" ||
    usage?.unlimited === true;

  /** Persist both ad preferences on the account, best-effort. */
  const pushPreferencesToAccount = useCallback(
    (next: { adsDisabled: boolean; soundMuted: boolean }) => {
      if (!token) return;
      void fetch(`${apiOrigin}/api/users/me/preferences`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adPreferences: next }),
      }).catch(() => {
        // Offline is fine: the device cache below re-syncs on a later change,
        // and the server copy stays whatever it last was.
      });
    },
    [token],
  );

  useEffect(() => {
    let cancelled = false;
    setPreferencesReady(false);
    void (async () => {
      // Device cache first so the gate can settle offline…
      const [storedMuted, storedDisabled] = await Promise.all([
        storage.getItemAsync(AD_SOUND_MUTED_KEY),
        user?.id != null
          ? storage.getItemAsync(`${ADS_DISABLED_KEY}:${user.id}`)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setSoundMutedState(storedMuted === "true");
      setAdsDisabledState(storedDisabled === "true");
      setPreferencesReady(true);

      // …then the account's stored answer wins, so the choice follows the
      // person to a reinstalled or second device.
      if (!token) return;
      try {
        const response = await fetch(`${apiOrigin}/api/users/me/preferences`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as {
          adPreferences?: { adsDisabled?: boolean; soundMuted?: boolean };
        };
        if (cancelled || !data.adPreferences) return;
        if (typeof data.adPreferences.soundMuted === "boolean") {
          setSoundMutedState(data.adPreferences.soundMuted);
          await storage.setItemAsync(
            AD_SOUND_MUTED_KEY,
            String(data.adPreferences.soundMuted),
          );
        }
        if (typeof data.adPreferences.adsDisabled === "boolean" && user?.id != null) {
          setAdsDisabledState(data.adPreferences.adsDisabled);
          await storage.setItemAsync(
            `${ADS_DISABLED_KEY}:${user.id}`,
            String(data.adPreferences.adsDisabled),
          );
        }
      } catch {
        // The device cache already answered.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.id]);

  const setSoundMuted = useCallback(
    async (muted: boolean) => {
      setSoundMutedState(muted);
      await storage.setItemAsync(AD_SOUND_MUTED_KEY, String(muted));
      pushPreferencesToAccount({ adsDisabled, soundMuted: muted });
    },
    [adsDisabled, pushPreferencesToAccount],
  );

  const setAdsDisabled = useCallback(
    async (disabled: boolean) => {
      if (disabled && !canDisableAds) return false;
      setAdsDisabledState(disabled);
      if (user?.id != null) {
        await storage.setItemAsync(
          `${ADS_DISABLED_KEY}:${user.id}`,
          String(disabled),
        );
      }
      pushPreferencesToAccount({ adsDisabled: disabled, soundMuted });
      return true;
    },
    [canDisableAds, pushPreferencesToAccount, soundMuted, user?.id],
  );

  useEffect(() => {
    if (!adsModule || !ready || consentInfo?.canRequestAds !== true) return;

    // Do not call into MobileAds merely because the JS module was imported.
    // On a cold release launch the module becomes available before UMP and
    // MobileAds initialization finish. Calling setAppMuted in that interval
    // can terminate Android at the native boundary instead of producing a JS
    // error. `adsModule` is now published only after initializeSdk succeeds,
    // and this guard also keeps preference changes harmless after an ad outage.
    try {
      adsModule.default().setAppMuted(soundMuted);
    } catch {
      // Ads are optional. A sound-preference failure must never close Casparel.
    }
  }, [adsModule, consentInfo, ready, soundMuted]);

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
      logAdDiagnostic('consent-status', {
        status: info?.status ?? 'unknown',
        canRequestAds: info?.canRequestAds ?? false,
      });

      if (!info?.canRequestAds) {
        logAdDiagnostic('request-blocked', { reason: 'consent' });
        setReady(true);
        return;
      }

      try {
        await initializeSdk(ads);
        logAdDiagnostic('sdk-initialized');
        if (!cancelled) setAdsModule(ads);
      } catch {
        // Ads are optional. Keep the dashboard available and leave the gate
        // closed when the native SDK cannot initialize.
        logAdDiagnostic('sdk-init-failed');
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
      // The Review account holds Pro-level access, so its Disable ads toggle
      // works exactly like a paying Pro's — off by default, effective when on.
      canRequestAds:
        ready &&
        preferencesReady &&
        consentInfo?.canRequestAds === true &&
        !(canDisableAds && adsDisabled),
      soundMuted,
      adsDisabled: canDisableAds && adsDisabled,
      canDisableAds,
      setSoundMuted,
      setAdsDisabled,
      privacyOptionsRequired:
        adsModule !== null &&
        consentInfo !== null &&
        privacyOptionsRequired(adsModule, consentInfo),
      showPrivacyOptions,
    }),
    [
      adsDisabled,
      adsModule,
      canDisableAds,
      consentInfo,
      preferencesReady,
      ready,
      setAdsDisabled,
      setSoundMuted,
      showPrivacyOptions,
      soundMuted,
    ],
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds(): AdsContextValue {
  return useContext(AdsContext);
}

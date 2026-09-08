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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adPreferencesQueryKey, adPreferencesQueryOptions } from "@/utils/ad-preferences-query";
import type { AdsConsentInfo } from "react-native-google-mobile-ads";
import { getGetMyUsageQueryKey, useGetMyUsage } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { usePurchases } from "@/contexts/PurchasesContext";
import { storage } from "@/utils/secure-storage";
import { apiOrigin } from "@/utils/api-host";
import { logAdDiagnostic } from "@/utils/ad-diagnostics";
import {
  adRequestAllowed,
  adSessionReady,
  canDisableAds as adsMayBeDisabledBy,
} from "@/utils/ad-placement";
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
  const { isAuthenticated, isLoading: authLoading, user, token } = useAuth();
  const { level } = usePurchases();
  const accountId = isAuthenticated ? user?.id ?? null : null;
  const queryClient = useQueryClient();
  const accountPreferences = useQuery(adPreferencesQueryOptions(accountId, token));
  const [cachedUserId, setCachedUserId] = useState<number | null | undefined>(undefined);
  const { ready: onboardingReady, needsOnboarding } = useOnboarding();
  // Entitlement is the wider of the store's answer and the server's: the
  // Review account and Institutional seats hold Pro-level access granted by
  // the server with no RevenueCat subscription behind it.
  const { data: usage } = useGetMyUsage({
    query: { enabled: isAuthenticated, queryKey: getGetMyUsageQueryKey() },
  });
  const [ready, setReady] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferencesUserId, setPreferencesUserId] = useState<number | null>(null);
  const [soundMuted, setSoundMutedState] = useState(false);
  const [adsDisabled, setAdsDisabledState] = useState(false);
  const [consentInfo, setConsentInfo] = useState<AdsConsentInfo | null>(null);
  const [adsModule, setAdsModule] = useState<GoogleMobileAdsModule | null>(
    null,
  );
  // One rule, unit-tested in utils/ad-placement.test.ts, so the Review
  // account's Pro-equivalent access cannot regress into "shown as Free".
  const entitlement = {
    storeLevel: isAuthenticated ? level : 'free' as const,
    serverTier: isAuthenticated ? usage?.tier ?? null : 'free' as const,
    unlimited: isAuthenticated && usage?.unlimited === true,
  };
  const canDisableAds = adsMayBeDisabledBy(entitlement);

  useEffect(() => {
    logAdDiagnostic('provider-mounted');
  }, []);

  useEffect(() => {
    if (!authLoading) {
      logAdDiagnostic('authentication-ready', {
        authenticated: isAuthenticated,
      });
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (onboardingReady) {
      logAdDiagnostic('onboarding-ready', { needsOnboarding });
    }
  }, [needsOnboarding, onboardingReady]);

  useEffect(() => {
    if (preferencesReady) logAdDiagnostic('preferences-ready');
  }, [preferencesReady]);

  useEffect(() => {
    logAdDiagnostic('ads-disabled', {
      saved: adsDisabled,
      effective: canDisableAds && adsDisabled,
      allowed: canDisableAds,
    });
  }, [adsDisabled, canDisableAds]);

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
    setCachedUserId(undefined);
    void (async () => {
      const [storedMuted, storedDisabled] = await Promise.all([
        storage.getItemAsync(AD_SOUND_MUTED_KEY),
        accountId !== null
          ? storage.getItemAsync(`${ADS_DISABLED_KEY}:${accountId}`)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setSoundMutedState(storedMuted === "true");
      setAdsDisabledState(storedDisabled === "true");
      setCachedUserId(accountId);
      if (accountId === null) {
        setPreferencesUserId(null);
        setPreferencesReady(true);
      }
    })().catch(() => {
      // A signed-in account can use its verified server preferences even
      // when secure storage is unavailable. Guests still fail closed.
      if (!cancelled && accountId !== null) setCachedUserId(accountId);
    });
    return () => { cancelled = true; };
  }, [accountId]);

  useEffect(() => {
    const preferences = accountPreferences.data;
    if (accountId === null || cachedUserId !== accountId || preferences?.userId !== accountId) return;
    setSoundMutedState(preferences.soundMuted);
    setAdsDisabledState(preferences.adsDisabled);
    setPreferencesUserId(accountId);
    setPreferencesReady(true);
    void Promise.all([
      storage.setItemAsync(AD_SOUND_MUTED_KEY, String(preferences.soundMuted)),
      storage.setItemAsync(`${ADS_DISABLED_KEY}:${accountId}`, String(preferences.adsDisabled)),
    ]).catch(() => {
      // The verified server answer remains usable if the device cache is full.
    });
  }, [accountId, accountPreferences.data, cachedUserId]);

  const rememberPreferenceChange = useCallback(async (next: { soundMuted?: boolean; adsDisabled?: boolean }) => {
    if (accountId === null) return;
    const queryKey = adPreferencesQueryKey(accountId);
    if (!queryClient.getQueryData(queryKey)) return;
    // An older in-flight read must not undo a choice just made on this phone.
    await queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData(queryKey, (previous: typeof accountPreferences.data) =>
      previous ? { ...previous, ...next } : previous,
    );
  }, [accountId, queryClient]);

  const setSoundMuted = useCallback(
    async (muted: boolean) => {
      await rememberPreferenceChange({ soundMuted: muted });
      setSoundMutedState(muted);
      await storage.setItemAsync(AD_SOUND_MUTED_KEY, String(muted));
      pushPreferencesToAccount({ adsDisabled, soundMuted: muted });
    },
    [adsDisabled, pushPreferencesToAccount, rememberPreferenceChange],
  );

  const setAdsDisabled = useCallback(
    async (disabled: boolean) => {
      if (disabled && !canDisableAds) return false;
      await rememberPreferenceChange({ adsDisabled: disabled });
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
    [canDisableAds, pushPreferencesToAccount, soundMuted, user?.id, rememberPreferenceChange],
  );

  useEffect(() => {
    if (!adsModule || !ready || consentInfo?.canRequestAds !== true) return;

    // Do not call into MobileAds merely because the JS module was imported.
    // On a cold release launch the module becomes available before UMP and
    // MobileAds initialization finish. Calling setAppMuted in that interval
    // can terminate Android at the native boundary instead of producing a JS
    // error. The readiness and consent guards also keep preference changes
    // harmless after an ad outage.
    try {
      adsModule.default().setAppMuted(soundMuted);
    } catch {
      // Ads are optional. A sound-preference failure must never close Casparel.
    }
  }, [adsModule, consentInfo, ready, soundMuted]);

  useEffect(() => {
    // Waiting until onboarding is complete prevents a system consent sheet
    // from interrupting the account-setup screens. No ad surface exists there.
    if (authLoading || !onboardingReady || (isAuthenticated && needsOnboarding)) {
      setReady(false);
      setConsentInfo(null);
      setAdsModule(null);
      return;
    }

    let cancelled = false;
    setReady(false);
    setConsentInfo(null);

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
  }, [authLoading, isAuthenticated, needsOnboarding, onboardingReady]);

  const showPrivacyOptions = useCallback(async (): Promise<boolean> => {
    const ads = adsModule ?? (await loadGoogleMobileAds());
    if (!ads) return false;
    try {
      const info = await ads.AdsConsent.showPrivacyOptionsForm();
      setConsentInfo(info);
      if (info.canRequestAds) {
        await initializeSdk(ads);
        setAdsModule(ads);
        setReady(true);
      }
      return true;
    } catch {
      return false;
    }
  }, [adsModule]);

  const requestAllowed = adRequestAllowed({
    sdkReady: ready && adsModule !== null && onboardingReady && !(isAuthenticated && needsOnboarding),
    entitlementReady: adSessionReady({ authLoading, isAuthenticated, serverPlanKnown: usage !== undefined }),
    preferencesReady: preferencesReady && preferencesUserId === accountId &&
      (!isAuthenticated || accountPreferences.data?.userId === accountId),
    consentGranted: consentInfo?.canRequestAds === true,
    adsDisabled,
    entitlement,
  });

  useEffect(() => {
    logAdDiagnostic('request-eligibility', {
      canRequestAds: requestAllowed,
      sdkReady: ready,
      preferencesReady,
      consentGranted: consentInfo?.canRequestAds === true,
      adsDisabled: canDisableAds && adsDisabled,
    });
  }, [
    adsDisabled,
    canDisableAds,
    consentInfo?.canRequestAds,
    preferencesReady,
    ready,
    requestAllowed,
  ]);

  const value = useMemo<AdsContextValue>(
    () => ({
      ready,
      // The Review account holds Pro-level access, so its Disable ads toggle
      // works exactly like a paying Pro's — off by default, effective when on.
      canRequestAds: requestAllowed,
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
      requestAllowed,
      setAdsDisabled,
      setSoundMuted,
      showPrivacyOptions,
      soundMuted,
      isAuthenticated, authLoading, onboardingReady, needsOnboarding, usage, level, preferencesUserId, user?.id,
    ],
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds(): AdsContextValue {
  return useContext(AdsContext);
}

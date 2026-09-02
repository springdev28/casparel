/**
 * @fileOverview Mobile state role: supplies a no-ad implementation outside Android.
 * System connection: app/_layout.tsx installs this provider on every platform;
 * Metro replaces it with AdsContext.android.tsx in the Android bundle.
 */
import React, { createContext, useContext } from "react";

interface AdsContextValue {
  /** UMP and the native ad SDK have reached a final usable/unusable state. */
  ready: boolean;
  /** Google says the current consent state permits an ad request. */
  canRequestAds: boolean;
  soundMuted: boolean;
  adsDisabled: boolean;
  canDisableAds: boolean;
  setSoundMuted: (muted: boolean) => Promise<void>;
  setAdsDisabled: (disabled: boolean) => Promise<boolean>;
  /** The current region/message configuration requires a settings entry. */
  privacyOptionsRequired: boolean;
  /** Present Google's current privacy-options form, when one is required. */
  showPrivacyOptions: () => Promise<boolean>;
}

const unsupported: AdsContextValue = {
  ready: true,
  canRequestAds: false,
  soundMuted: false,
  adsDisabled: false,
  canDisableAds: false,
  setSoundMuted: async () => {},
  setAdsDisabled: async () => false,
  privacyOptionsRequired: false,
  showPrivacyOptions: async () => false,
};

const AdsContext = createContext<AdsContextValue>(unsupported);

export function AdsProvider({ children }: { children: React.ReactNode }) {
  return (
    <AdsContext.Provider value={unsupported}>{children}</AdsContext.Provider>
  );
}

export function useAds(): AdsContextValue {
  return useContext(AdsContext);
}

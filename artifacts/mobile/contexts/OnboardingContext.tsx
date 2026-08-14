import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { storage } from '@/utils/secure-storage';

const ONBOARDED_KEY = 'casparel_onboarded';

interface OnboardingContextValue {
  /** The stored flag has been read (or definitively failed). */
  ready: boolean;
  /** The user has not yet completed first-run onboarding. */
  needsOnboarding: boolean;
  /** Mark onboarding complete (updates shared state + persists). */
  complete: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const seen = await storage.getItemAsync(ONBOARDED_KEY);
        if (active) setNeedsOnboarding(seen !== 'true');
      } catch {
        // Fail safe: never block entry to the app if the flag can't be read.
        if (active) setNeedsOnboarding(false);
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const complete = useCallback(async () => {
    setNeedsOnboarding(false);
    try {
      await storage.setItemAsync(ONBOARDED_KEY, 'true');
    } catch {
      // ignore — state is already updated for this session
    }
  }, []);

  return (
    <OnboardingContext.Provider value={{ ready, needsOnboarding, complete }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within an OnboardingProvider');
  return ctx;
}

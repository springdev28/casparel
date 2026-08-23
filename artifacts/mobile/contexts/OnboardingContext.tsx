/**
 * @fileOverview Mobile state role: owns the app-wide Onboarding Context context and lifecycle.
 * System connection: installed by app/_layout.tsx and consumed by screens/components that need shared account state.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { storage } from '@/utils/secure-storage';
import type { MobileOnboardingSearchDestination } from '@/utils/onboarding-state';

const ONBOARDED_KEY = 'casparel_onboarded';
export type OnboardingDestination = MobileOnboardingSearchDestination;

interface OnboardingContextValue {
  /** The stored flag has been read (or definitively failed). */
  ready: boolean;
  /** The user has not yet completed first-run onboarding. */
  needsOnboarding: boolean;
  /** True when an experienced user deliberately reopens the guide. */
  replaying: boolean;
  /** Mark onboarding complete and optionally request a one-time real-task handoff. */
  complete: (destination?: OnboardingDestination) => Promise<void>;
  /** Reopen onboarding from Profile without treating that screen as a deferred deep link. */
  restart: () => Promise<void>;
  /** Root navigation consumes this once after onboarding releases the router. */
  takeCompletionDestination: () => OnboardingDestination | null;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const completionDestinationRef = useRef<OnboardingDestination | null>(null);

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

  const complete = useCallback(async (destination?: OnboardingDestination) => {
    // A ref preserves the requested route across the state change without
    // causing an intermediate render that could redirect too early.
    completionDestinationRef.current = destination ?? null;
    setReplaying(false);
    setNeedsOnboarding(false);
    try {
      await storage.setItemAsync(ONBOARDED_KEY, 'true');
    } catch {
      // ignore, state is already updated for this session
    }
  }, []);

  const restart = useCallback(async () => {
    completionDestinationRef.current = null;
    setReplaying(true);
    setNeedsOnboarding(true);
    try {
      await storage.deleteItemAsync(ONBOARDED_KEY);
    } catch {
      // The in-memory replay still works; persistence can be retried on completion.
    }
  }, []);

  const takeCompletionDestination = useCallback(() => {
    const destination = completionDestinationRef.current;
    completionDestinationRef.current = null;
    return destination;
  }, []);

  return (
    <OnboardingContext.Provider
      value={{
        ready,
        needsOnboarding,
        replaying,
        complete,
        restart,
        takeCompletionDestination,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within an OnboardingProvider');
  return ctx;
}

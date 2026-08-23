/**
 * @fileOverview Mobile accessibility role: provides one reduced-motion decision and named transition durations.
 * System connection: wraps Expo Router in the root layout and is consumed by reusable animated controls and screens.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  normalizeMotionMode,
  resolveMotionDuration,
  resolveReducedMotion,
  type MotionDuration,
  type MotionMode,
} from '@/utils/motion-policy';

interface MotionContextValue {
  /** True when travel, scale, and looping animation should be removed. */
  reduceMotion: boolean;
  /** The effective override, normally `system`. */
  mode: MotionMode;
  /** Resolves a named duration to milliseconds under the current policy. */
  duration: (name: MotionDuration) => number;
}
const MotionContext = createContext<MotionContextValue | null>(null);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  // Starting conservatively prevents first-render animation before the async
  // operating-system preference is available.
  const [systemPrefersReducedMotion, setSystemPrefersReducedMotion] = useState(true);
  const mode = normalizeMotionMode(process.env.EXPO_PUBLIC_MOTION_MODE);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setSystemPrefersReducedMotion(enabled);
    });

    // React Native emits this event whenever the user changes the OS setting,
    // so the app does not need to restart to become accessible.
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setSystemPrefersReducedMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const reduceMotion = resolveReducedMotion(systemPrefersReducedMotion, mode);
  const value = useMemo<MotionContextValue>(
    () => ({
      reduceMotion,
      mode,
      duration: (name) => resolveMotionDuration(name, reduceMotion),
    }),
    [mode, reduceMotion],
  );

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotion(): MotionContextValue {
  const value = useContext(MotionContext);
  if (!value) throw new Error('useMotion must be used within MotionProvider');
  return value;
}

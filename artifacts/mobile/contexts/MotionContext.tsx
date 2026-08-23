/**
 * @fileOverview Mobile state role: centralises native motion timing, reduced-motion state, and optional haptic feedback.
 * System connection: installed by app/_layout.tsx and consumed by shared mobile interactions such as Save and sheets.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';
import { durationForMotion, type MotionDuration } from '@/utils/motion';

type MotionContextValue = {
  reduceMotion: boolean;
  duration: (token: MotionDuration) => number;
  selection: () => void;
  success: () => void;
  warning: () => void;
};

const MotionContext = createContext<MotionContextValue | null>(null);

/** Haptics are enhancement only: unsupported hardware must never block a write. */
function ignoreUnsupported(feedback: Promise<void>) {
  void feedback.catch(() => undefined);
}

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const value = useMemo<MotionContextValue>(
    () => ({
      reduceMotion,
      duration: (token) => durationForMotion(reduceMotion, token),
      selection: () => ignoreUnsupported(Haptics.selectionAsync()),
      success: () => ignoreUnsupported(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
      warning: () => ignoreUnsupported(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
    }),
    [reduceMotion],
  );

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotion(): MotionContextValue {
  const context = useContext(MotionContext);
  if (!context) throw new Error('useMotion must be used within MotionProvider');
  return context;
}

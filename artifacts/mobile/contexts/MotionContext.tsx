/**
 * @fileOverview Mobile state role: centralises native motion timing, reduced-motion state, and optional haptic feedback.
 * System connection: installed by app/_layout.tsx and consumed by shared mobile interactions such as Save and sheets.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { installNativeFeedback, nativeFeedback } from '@workspace/edu-ds/lib/native-feedback';
import { storage } from '@/utils/secure-storage';
import * as Haptics from 'expo-haptics';
import { durationForMotion, type MotionDuration } from '@/utils/motion';

type MotionContextValue = {
  soundEffectsEnabled: boolean;
  setSoundEffectsEnabled: (enabled: boolean) => void;
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
  const [soundEffectsEnabled, setSoundEffectsState] = useState(false);
  const enabledRef = useRef(false);
  const preferenceVersion = useRef(0);
  const tick = useAudioPlayer(require('../assets/audio/tick.wav'));
  const success = useAudioPlayer(require('../assets/audio/success.wav'));
  const error = useAudioPlayer(require('../assets/audio/error.wav'));
  const setSoundEffectsEnabled = (enabled: boolean) => {
    preferenceVersion.current++;
    enabledRef.current = enabled;
    setSoundEffectsState(enabled);
    void storage.setItemAsync('schoolar_sound_effects', enabled ? 'on' : 'off').catch(() => {});
  };
  useEffect(() => {
    const version = preferenceVersion.current;
    let alive = true;
    void storage.getItemAsync('schoolar_sound_effects').then(value => {
      if (!alive || version !== preferenceVersion.current) return;
      enabledRef.current = value !== 'off';
      setSoundEffectsState(value !== 'off');
    }).catch(() => {});
    void setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    let last = 0;
    return installNativeFeedback(kind => {
      if (!enabledRef.current || AppState.currentState !== 'active' || Date.now() - last < 90) return;
      last = Date.now();
      const requestedAt = last;
      const player = { tick, success, error }[kind];
      void player.seekTo(0).then(() => {
        if (enabledRef.current && AppState.currentState === 'active' && Date.now() - requestedAt < 250) player.play();
      }).catch(() => {});
    });
  }, [tick, success, error]);
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
      soundEffectsEnabled,
      setSoundEffectsEnabled,
      reduceMotion,
      duration: (token) => durationForMotion(reduceMotion, token),
      selection: () => { nativeFeedback("tick"); ignoreUnsupported(Haptics.selectionAsync()); },
      success: () => { nativeFeedback("success"); ignoreUnsupported(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); },
      warning: () => { nativeFeedback("error"); ignoreUnsupported(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)); },
    }),
    [reduceMotion, soundEffectsEnabled],
  );

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotion(): MotionContextValue {
  const context = useContext(MotionContext);
  if (!context) throw new Error('useMotion must be used within MotionProvider');
  return context;
}

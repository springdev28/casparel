/**
 * @fileOverview Mobile feedback role: maps semantic interaction outcomes to safe Expo haptic calls.
 * System connection: used by animated controls and successful mutations; unsupported platforms remain fully functional.
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export type HapticIntent = 'selection' | 'light' | 'success' | 'warning' | 'error';

/** Haptics are enhancement only: an unavailable motor must never fail the action. */
export async function triggerHaptic(intent: HapticIntent): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    if (intent === 'selection') {
      await Haptics.selectionAsync();
      return;
    }
    if (intent === 'light') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }

    const notification = {
      success: Haptics.NotificationFeedbackType.Success,
      warning: Haptics.NotificationFeedbackType.Warning,
      error: Haptics.NotificationFeedbackType.Error,
    }[intent];
    await Haptics.notificationAsync(notification);
  } catch {
    // Some simulators, browsers, and low-power device states expose the API
    // while rejecting the operation. Visual feedback remains authoritative.
  }
}

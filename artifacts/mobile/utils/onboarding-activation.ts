/**
 * @fileOverview Mobile workflow role: marks a first-run resource task until a server-confirmed save completes it.
 * System connection: OnboardingScreen begins the marker; SaveResourceSheet consumes it before emitting completion analytics.
 */
import { storage } from '@/utils/secure-storage';

const MOBILE_ONBOARDING_ACTIVATION_STORAGE_KEY = 'casparel_mobile_onboarding_activation_v1';

/** Storage failure must never trap the learner inside onboarding. */
export async function beginMobileOnboardingActivation(): Promise<void> {
  try {
    await storage.setItemAsync(MOBILE_ONBOARDING_ACTIVATION_STORAGE_KEY, 'pending');
  } catch {
    // Activation telemetry is best-effort; the real learning workflow still proceeds.
  }
}

/** Consume once so later saves and tutorial replays cannot double-count activation. */
export async function completeMobileOnboardingActivation(): Promise<boolean> {
  try {
    const marker = await storage.getItemAsync(MOBILE_ONBOARDING_ACTIVATION_STORAGE_KEY);
    if (marker !== 'pending') return false;
    await storage.deleteItemAsync(MOBILE_ONBOARDING_ACTIVATION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * @fileOverview Mobile domain role: validates the resumable guided-task draft without trusting persisted device data.
 * System connection: OnboardingScreen stores this draft locally before handing the learner into the real Resources workflow.
 */
export const MOBILE_ONBOARDING_DRAFT_STORAGE_KEY = 'casparel_mobile_onboarding_draft_v2';
export const MOBILE_ONBOARDING_STEP_COUNT = 3;

export interface MobileOnboardingDraft {
  step: number;
  learningNeed: string;
}

export type MobileOnboardingSearchDestination =
  `/(tabs)/resources?onboarding=1&goal=${string}`;

export const EMPTY_MOBILE_ONBOARDING_DRAFT: MobileOnboardingDraft = {
  step: 0,
  learningNeed: '',
};

/** Secure storage can survive app upgrades, so reject stale or manually edited payloads as a unit. */
export function parseMobileOnboardingDraft(raw: string | null): MobileOnboardingDraft {
  if (!raw) return EMPTY_MOBILE_ONBOARDING_DRAFT;
  try {
    const value = JSON.parse(raw) as { step?: unknown; learningNeed?: unknown };
    if (
      !Number.isSafeInteger(value.step) ||
      (value.step as number) < 0 ||
      (value.step as number) >= MOBILE_ONBOARDING_STEP_COUNT ||
      typeof value.learningNeed !== 'string' ||
      value.learningNeed.length > 300
    ) {
      return EMPTY_MOBILE_ONBOARDING_DRAFT;
    }
    return { step: value.step as number, learningNeed: value.learningNeed };
  } catch {
    return EMPTY_MOBILE_ONBOARDING_DRAFT;
  }
}

export function mobileOnboardingProgressPercent(step: number): number {
  const boundedStep = Math.max(0, Math.min(MOBILE_ONBOARDING_STEP_COUNT - 1, step));
  return Math.round(((boundedStep + 1) / MOBILE_ONBOARDING_STEP_COUNT) * 100);
}

/** Build an encoded internal handoff that also updates an already-mounted Resources tab. */
export function mobileOnboardingSearchDestination(
  learningNeed: string,
): MobileOnboardingSearchDestination {
  return `/(tabs)/resources?onboarding=1&goal=${encodeURIComponent(learningNeed.trim())}`;
}

/** Route parameters are external input too, even when this screen normally creates them. */
export function mobileOnboardingLearningNeed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 300 ? trimmed : null;
}

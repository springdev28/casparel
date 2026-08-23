/**
 * @fileOverview Verification role: protects exact mobile tutorial restoration and rejects unsafe persisted drafts.
 * System connection: covers the pure storage boundary used by OnboardingScreen before any navigation or API work occurs.
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_MOBILE_ONBOARDING_DRAFT,
  mobileOnboardingLearningNeed,
  mobileOnboardingProgressPercent,
  mobileOnboardingSearchDestination,
  parseMobileOnboardingDraft,
} from './onboarding-state';

describe('mobile onboarding state', () => {
  it('restores the exact guided-task step and learning need', () => {
    expect(parseMobileOnboardingDraft('{"step":2,"learningNeed":"learn fractions"}')).toEqual({
      step: 2,
      learningNeed: 'learn fractions',
    });
  });

  it('rejects malformed, out-of-range, and oversized drafts', () => {
    expect(parseMobileOnboardingDraft('not-json')).toEqual(EMPTY_MOBILE_ONBOARDING_DRAFT);
    expect(parseMobileOnboardingDraft('{"step":3,"learningNeed":"valid"}')).toEqual(
      EMPTY_MOBILE_ONBOARDING_DRAFT,
    );
    expect(
      parseMobileOnboardingDraft(JSON.stringify({ step: 1, learningNeed: 'x'.repeat(301) })),
    ).toEqual(EMPTY_MOBILE_ONBOARDING_DRAFT);
  });

  it('reports bounded progress for all three steps', () => {
    expect(mobileOnboardingProgressPercent(-1)).toBe(33);
    expect(mobileOnboardingProgressPercent(1)).toBe(67);
    expect(mobileOnboardingProgressPercent(99)).toBe(100);
  });

  it('encodes and bounds the real-search handoff', () => {
    expect(mobileOnboardingSearchDestination('  forces & motion  ')).toBe(
      '/(tabs)/resources?onboarding=1&goal=forces%20%26%20motion',
    );
    expect(mobileOnboardingLearningNeed('  forces & motion  ')).toBe('forces & motion');
    expect(mobileOnboardingLearningNeed('x'.repeat(301))).toBeNull();
  });
});

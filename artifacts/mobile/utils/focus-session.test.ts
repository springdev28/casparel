/**
 * @fileOverview Verification role: protects background-safe focus timing, display formatting, and stable submission-key construction.
 * System connection: covers the pure rules used by the path-step study screen before it persists evidence.
 */
import { describe, expect, it } from 'vitest';
import {
  createEvidenceSubmissionId,
  elapsedStudySeconds,
  formatStudyTime,
  remainingStudySeconds,
} from './focus-session';

describe('focused-study helpers', () => {
  it('derives elapsed time from the absolute start instead of interval ticks', () => {
    expect(elapsedStudySeconds(12, 1_000, 6_999)).toBe(17);
    expect(remainingStudySeconds(25 * 60, 17)).toBe(1483);
  });

  it('formats bounded minute-and-second output', () => {
    expect(formatStudyTime(65)).toBe('1:05');
    expect(formatStudyTime(-10)).toBe('0:00');
  });

  it('creates a deterministic, sufficiently long retry key from injected inputs', () => {
    expect(createEvidenceSubmissionId(1_000, 0.5)).toBe('mobile-focus-rs-i0000000');
  });
});

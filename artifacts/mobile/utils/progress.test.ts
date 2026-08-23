/**
 * @fileOverview Verification role: protects bounded path progress for visual and accessibility output.
 * System connection: covers the pure calculations consumed by ProgressTransition.
 */
import { describe, expect, it } from 'vitest';
import { clampProgress, progressPercent } from './progress';

describe('mobile progress helpers', () => {
  it('clamps invalid and out-of-range values', () => {
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(-0.2)).toBe(0);
    expect(clampProgress(1.4)).toBe(1);
  });

  it('provides a stable whole-number accessibility percentage', () => {
    expect(progressPercent(2 / 3)).toBe(67);
  });
});

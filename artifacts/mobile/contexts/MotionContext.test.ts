/**
 * @fileOverview Verification role: guards the mobile motion contract and its reduced-motion fallback.
 * System connection: runs in the mobile Vitest suite without requiring a native renderer.
 */
import { describe, expect, it } from 'vitest';
// Keep unit tests independent from Expo's Metro path aliases. Vitest runs this
// file directly in Node, where the relative import is the portable choice.
import { durationForMotion, MOTION_DURATION } from '../utils/motion';

describe('mobile motion timing', () => {
  it('uses the canonical durations from the product specification', () => {
    expect(MOTION_DURATION).toEqual({
      instant: 80,
      quick: 160,
      standard: 240,
      emphasis: 400,
    });
  });

  it('removes decorative duration when Reduce Motion is enabled', () => {
    expect(durationForMotion(true, 'emphasis')).toBe(0);
    expect(durationForMotion(false, 'standard')).toBe(240);
  });
});

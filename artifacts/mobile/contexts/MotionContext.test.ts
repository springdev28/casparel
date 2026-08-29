/**
 * @fileOverview Verification role: guards the mobile motion contract and its reduced-motion fallback.
 * System connection: runs in the mobile Vitest suite without requiring a native renderer.
 */
import { describe, expect, it } from 'vitest';
// Keep unit tests independent from Expo's Metro path aliases. Vitest runs this
// file directly in Node, where the relative import is the portable choice.
import {
  durationForMotion,
  entranceTiming,
  MOTION_DURATION,
  STAGGER_STEP,
} from '../utils/motion';

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

describe('entrance timing', () => {
  it('staggers by the canonical step when motion is allowed', () => {
    expect(entranceTiming(false, 0)).toEqual({ duration: 400, delay: 0 });
    expect(entranceTiming(false, 2)).toEqual({ duration: 400, delay: 2 * STAGGER_STEP });
  });

  it('takes a shorter token when one is asked for', () => {
    expect(entranceTiming(false, 0, 'quick').duration).toBe(160);
  });

  /*
   * Both halves, not just the duration. A sequence of instant appearances
   * arriving ninety milliseconds apart is still motion across the screen --
   * it is the thing being asked about, drawn without the fade.
   */
  it('removes the movement and the stagger when Reduce Motion is enabled', () => {
    expect(entranceTiming(true, 0)).toEqual({ duration: 0, delay: 0 });
    expect(entranceTiming(true, 3)).toEqual({ duration: 0, delay: 0 });
    expect(entranceTiming(true, 3, 'quick')).toEqual({ duration: 0, delay: 0 });
  });
});

/**
 * @fileOverview Verification role: protects system, forced-full, and forced-reduced mobile motion behavior.
 * System connection: covers the pure policy used by MotionContext and animated mobile controls.
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeMotionMode,
  resolveMotionDuration,
  resolveReducedMotion,
} from './motion-policy';

describe('mobile motion policy', () => {
  it('uses the operating-system preference in system mode', () => {
    expect(resolveReducedMotion(true, 'system')).toBe(true);
    expect(resolveReducedMotion(false, 'system')).toBe(false);
  });

  it('supports deterministic full and reduced audit modes', () => {
    expect(resolveReducedMotion(false, normalizeMotionMode('reduced'))).toBe(true);
    expect(resolveReducedMotion(true, normalizeMotionMode('full'))).toBe(false);
    expect(normalizeMotionMode('unexpected')).toBe('system');
  });

  it('removes duration without removing the semantic state change', () => {
    expect(resolveMotionDuration('standard', true)).toBe(0);
    expect(resolveMotionDuration('standard', false)).toBe(220);
  });
});

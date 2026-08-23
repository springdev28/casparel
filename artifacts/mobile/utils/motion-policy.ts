/**
 * @fileOverview Pure policy for mobile motion durations and deterministic audit overrides.
 * System connection: consumed by MotionContext so screens and shared interaction primitives follow one accessibility decision.
 */

/** Named durations make the reason for a transition clearer than a raw number. */
export const MOTION_DURATION_MS = {
  instant: 0,
  quick: 140,
  standard: 220,
  deliberate: 320,
} as const;

export type MotionDuration = keyof typeof MOTION_DURATION_MS;
export type MotionMode = 'system' | 'full' | 'reduced';

/** Unknown environment values fall back to the user's operating-system choice. */
export function normalizeMotionMode(value: string | undefined): MotionMode {
  if (value === 'full' || value === 'reduced') return value;
  return 'system';
}
/** A deterministic override is useful for screenshots and reduced-motion audits. */
export function resolveReducedMotion(
  systemPrefersReducedMotion: boolean,
  mode: MotionMode,
): boolean {
  if (mode === 'reduced') return true;
  if (mode === 'full') return false;
  return systemPrefersReducedMotion;
}

/** Reduced motion keeps the state change but removes its travel time. */
export function resolveMotionDuration(
  duration: MotionDuration,
  reduceMotion: boolean,
): number {
  return reduceMotion ? MOTION_DURATION_MS.instant : MOTION_DURATION_MS[duration];
}

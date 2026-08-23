/**
 * @fileOverview Mobile support role: defines canonical motion tokens and the pure reduced-motion timing rule.
 * System connection: consumed by MotionContext and testable without loading a native renderer.
 */
export const MOTION_DURATION = {
  instant: 80,
  quick: 160,
  standard: 240,
  emphasis: 400,
} as const;

export type MotionDuration = keyof typeof MOTION_DURATION;

export function durationForMotion(reduceMotion: boolean, token: MotionDuration): number {
  return reduceMotion ? 0 : MOTION_DURATION[token];
}

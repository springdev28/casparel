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

/**
 * How long an entrance runs and how long it waits, given the setting.
 *
 * The tokens above and `durationForMotion` existed and were tested, and the
 * two screens in this app that actually animate used neither: seven staggered
 * fade-ins on onboarding and the paywall ran for a hard-coded 450 or 500
 * milliseconds, whatever a reader had asked for. Reduce Motion is not a
 * preference about decoration -- for some people motion causes nausea or
 * migraine, and an app that ignores it is one they close.
 *
 * The stagger goes too, not just the duration. A sequence of instant
 * appearances arriving ninety milliseconds apart is still motion across the
 * screen; it is the thing being asked about, drawn without the fade.
 */
export function entranceTiming(
  reduceMotion: boolean,
  index = 0,
  token: MotionDuration = "emphasis",
): { duration: number; delay: number } {
  if (reduceMotion) return { duration: 0, delay: 0 };
  return { duration: MOTION_DURATION[token], delay: index * STAGGER_STEP };
}

/**
 * The gap between one entrance and the next.
 *
 * Ninety milliseconds, which is what onboarding already used by hand. Small
 * enough that four rows finish before somebody has read the first, which is
 * the point of a stagger: it should suggest an order, not make a reader wait.
 */
export const STAGGER_STEP = 90;

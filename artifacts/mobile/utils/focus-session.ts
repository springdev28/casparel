/**
 * @fileOverview Pure focused-study clock, formatting, and idempotency-key helpers.
 * System connection: the path-step study screen derives time from absolute timestamps and sends one stable key with its evidence mutation.
 */

export const FOCUS_DURATION_PRESETS = [10 * 60, 25 * 60, 45 * 60] as const;

/**
 * Absolute timestamps make a running timer catch up correctly after the app is
 * backgrounded; the interval only refreshes the display and is not the clock.
 */
export function elapsedStudySeconds(
  accumulatedSeconds: number,
  startedAtMs: number | null,
  nowMs: number,
): number {
  const runningSeconds = startedAtMs === null ? 0 : Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  return Math.max(0, Math.floor(accumulatedSeconds)) + runningSeconds;
}

export function remainingStudySeconds(durationSeconds: number, elapsedSeconds: number): number {
  return Math.max(0, Math.floor(durationSeconds) - Math.max(0, Math.floor(elapsedSeconds)));
}

export function formatStudyTime(seconds: number): string {
  const normalized = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(normalized / 60);
  return `${minutes}:${String(normalized % 60).padStart(2, '0')}`;
}

/** The random suffix is not a credential; uniqueness makes network retries converge. */
export function createEvidenceSubmissionId(nowMs = Date.now(), randomValue = Math.random()): string {
  const randomPart = Math.floor(Math.max(0, Math.min(0.999999999, randomValue)) * 36 ** 8)
    .toString(36)
    .padStart(8, '0');
  return `mobile-focus-${nowMs.toString(36)}-${randomPart}`;
}

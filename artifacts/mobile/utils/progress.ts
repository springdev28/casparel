/**
 * @fileOverview Pure mobile progress helpers that keep percentages finite and bounded.
 * System connection: used by animated path-progress components and their deterministic tests.
 */

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
export function progressPercent(value: number): number {
  return Math.round(clampProgress(value) * 100);
}

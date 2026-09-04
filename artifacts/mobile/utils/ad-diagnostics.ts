/**
 * @fileOverview Mobile support role: one safe diagnostic log line per ad lifecycle state.
 * System connection: called from AdsContext and the sponsored card so a
 * production logcat answers "why is there no ad" without exposing anyone.
 */

export type AdDiagnosticState =
  | 'sdk-initialized'
  | 'sdk-init-failed'
  | 'consent-status'
  | 'request-permitted'
  | 'request-blocked'
  | 'unit-present'
  | 'unit-missing'
  | 'ad-requested'
  | 'ad-loaded'
  | 'ad-no-fill'
  | 'ad-request-failed'
  | 'ad-displayed';

/**
 * Values are restricted to primitives so nothing rich (a user object, a
 * token, an error with request headers) can be logged by accident. AdMob
 * response ids and unit ids are Google-issued identifiers, not user data.
 */
export function logAdDiagnostic(
  state: AdDiagnosticState,
  detail?: Record<string, string | number | boolean | null | undefined>,
): void {
  const parts = detail
    ? Object.entries(detail)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${String(value)}`)
    : [];
  // eslint-disable-next-line no-console
  console.log(`[ads] ${state}${parts.length ? ' ' + parts.join(' ') : ''}`);
}

/** AdMob's "the request worked, there was simply nothing to show". */
export const ADMOB_NO_FILL_CODE = 'googleMobileAds/no-fill';

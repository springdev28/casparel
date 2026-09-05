/**
 * @fileOverview Mobile support role: one safe diagnostic log line per ad lifecycle state.
 * System connection: called from AdsContext and the sponsored card so a
 * production logcat answers "why is there no ad" without exposing anyone.
 */

export type AdDiagnosticState =
  | 'provider-mounted'
  | 'authentication-ready'
  | 'onboarding-ready'
  | 'preferences-ready'
  | 'ads-disabled'
  | 'sdk-initialized'
  | 'sdk-init-failed'
  | 'consent-status'
  | 'request-eligibility'
  | 'request-permitted'
  | 'request-blocked'
  | 'production-unit-selected'
  | 'unit-missing'
  | 'ad-requested'
  | 'ad-loaded'
  | 'ad-no-fill'
  | 'ad-request-failed'
  | 'ad-displayed'
  | 'placement-mounted'
  | 'placement-dismissed';

/**
 * Values are restricted to primitives so nothing rich (a user object, a
 * token, an error with request headers) can be logged by accident. Unit ids,
 * public SDK keys and response ids are deliberately omitted too: support only
 * needs the lifecycle state and a safe failure category.
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

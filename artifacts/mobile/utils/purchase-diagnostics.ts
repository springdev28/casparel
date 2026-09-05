/**
 * @fileOverview Mobile support role: emits safe RevenueCat lifecycle diagnostics.
 * System connection: PurchasesContext reports configuration and offering state
 * so an internal or Play license-test build explains why its paywall is empty.
 */

export type PurchaseDiagnosticState =
  | 'provider-mounted'
  | 'configuration-started'
  | 'configured'
  | 'configuration-error'
  | 'offering-requested'
  | 'offering-request-failed'
  | 'default-offering-found'
  | 'default-offering-missing'
  | 'package-count'
  | 'package-identifiers';

/**
 * The detail surface only accepts primitives. Callers report package
 * identifiers, counts and fixed categories—never API keys, customer ids,
 * tokens, email addresses, receipt data, or raw provider errors.
 */
export function logPurchaseDiagnostic(
  state: PurchaseDiagnosticState,
  detail?: Record<string, string | number | boolean | null | undefined>,
): void {
  const parts = detail
    ? Object.entries(detail)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${String(value)}`)
    : [];
  // eslint-disable-next-line no-console
  console.log(
    `[purchases] ${state}${parts.length ? ` ${parts.join(' ')}` : ''}`,
  );
}

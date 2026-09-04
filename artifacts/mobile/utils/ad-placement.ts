/** Routes where a sponsored section is safe and useful in the Android shell. */
const EXCLUDED_PREFIXES = [
  '/admin',
  '/auth',
  '/delete-account',
  '/messages',
  '/plans',
  '/profile',
  '/reset-account',
  '/settings',
];

export function shouldShowSponsoredAd(rawPath: string): boolean {
  const path = rawPath.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
  if (
    EXCLUDED_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  ) {
    return false;
  }

  // Detail routes are creation/editing workspaces. Their list pages remain
  // eligible, but an ad must not interrupt focused canvas or class editing.
  if (/^\/(?:canvases|classes)\/[^/]+/.test(path)) return false;
  return path !== '/';
}

/**
 * Who may turn advertising off, and whether it is currently off.
 *
 * Entitlement is the wider of two answers. RevenueCat knows about purchased
 * subscriptions; the server knows about the ones nobody bought — the Google
 * Play review account, which is granted Pro so a reviewer can exercise every
 * paid feature, and Institutional seats a school was given. Reading only
 * the store would show both of those a control they are entitled to and tell
 * them they are not.
 */
export interface AdEntitlement {
  /** RevenueCat's price level for the active subscription. */
  storeLevel: 'free' | 'plus' | 'pro';
  /** The server's tier for the account, which covers non-purchased access. */
  serverTier?: 'free' | 'plus' | 'pro' | 'institutional' | 'administrator' | null;
  /** True for administrators, who are uncapped. */
  unlimited?: boolean;
}

export function canDisableAds(entitlement: AdEntitlement): boolean {
  return (
    entitlement.storeLevel === 'pro' ||
    entitlement.serverTier === 'pro' ||
    entitlement.serverTier === 'institutional' ||
    entitlement.serverTier === 'administrator' ||
    entitlement.unlimited === true
  );
}

/**
 * Whether an ad request may be made at all.
 *
 * Fails closed on everything unfinished: consent still unknown, preferences
 * still loading, the SDK not yet initialized. The saved preference only takes
 * effect for an account entitled to it, so a lapsed Pro keeps their choice
 * stored without it silently continuing to suppress ads.
 */
export function adRequestAllowed(state: {
  sdkReady: boolean;
  preferencesReady: boolean;
  consentGranted: boolean;
  adsDisabled: boolean;
  entitlement: AdEntitlement;
}): boolean {
  if (!state.sdkReady || !state.preferencesReady) return false;
  if (!state.consentGranted) return false;
  if (canDisableAds(state.entitlement) && state.adsDisabled) return false;
  return true;
}

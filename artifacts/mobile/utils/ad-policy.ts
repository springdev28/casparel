/**
 * One conservative advertising decision shared by every native placement.
 * The backend plan and RevenueCat must both say Free. This makes an upgrade
 * hide ads as soon as either entitlement source refreshes, while an unknown
 * or partially loaded account always fails closed.
 */
export function mayShowProgrammaticAd(input: {
  platform: string;
  accountRole?: string | null;
  serverTier?: string | null;
  revenueCatTier?: string | null;
}): boolean {
  return (
    input.platform === 'android' &&
    input.accountRole !== 'admin' &&
    input.serverTier === 'free' &&
    input.revenueCatTier === 'free'
  );
}

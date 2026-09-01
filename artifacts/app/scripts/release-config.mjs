/** Pure validation for public values Vite embeds into the production bundle. */
export function validateWebReleaseConfig(env) {
  const problems = [];
  const revenueCatKey = String(env.VITE_REVENUECAT_WEB_API_KEY ?? '').trim();
  const adsenseClient = String(env.VITE_ADSENSE_CLIENT_ID ?? '').trim();
  const adsenseSlot = String(env.VITE_ADSENSE_DASHBOARD_SLOT ?? '').trim();

  if (!revenueCatKey) {
    problems.push('VITE_REVENUECAT_WEB_API_KEY is missing');
  } else if (!revenueCatKey.startsWith('rcb_')) {
    problems.push('VITE_REVENUECAT_WEB_API_KEY must be a RevenueCat Web Billing public key (rcb_)');
  }

  if (!/^ca-pub-\d{16}$/.test(adsenseClient)) {
    problems.push('VITE_ADSENSE_CLIENT_ID must be an AdSense publisher client such as ca-pub-1234567890123456');
  }
  if (!/^\d{5,20}$/.test(adsenseSlot)) {
    problems.push('VITE_ADSENSE_DASHBOARD_SLOT must be the numeric dashboard ad-slot id');
  }

  return problems;
}

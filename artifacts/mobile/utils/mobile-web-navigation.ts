/** Decide whether a WebView URL stays in Casparel or leaves the app. */
export type MobileWebDestination =
  | { kind: 'internal'; url: string; path: string }
  | { kind: 'paywall' }
  | { kind: 'home' }
  | { kind: 'login' }
  | { kind: 'register' }
  | { kind: 'external'; url: string }
  | { kind: 'ignore' };

function canonicalHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

export function classifyMobileWebUrl(
  rawUrl: string,
  appOrigin: string,
): MobileWebDestination {
  if (!rawUrl || rawUrl === 'about:blank') return { kind: 'ignore' };

  let url: URL;
  let origin: URL;
  try {
    url = new URL(rawUrl, appOrigin);
    origin = new URL(appOrigin);
  } catch {
    return { kind: 'external', url: rawUrl };
  }

  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  const isCasparel =
    isHttp && canonicalHost(url.hostname) === canonicalHost(origin.hostname);
  if (!isCasparel) return { kind: 'external', url: url.toString() };

  if (url.pathname === '/plans' || url.pathname === '/plans/') {
    return { kind: 'paywall' };
  }
  if (url.pathname === '/' || url.pathname === '') return { kind: 'home' };
  if (/^\/auth\/login\/?$/.test(url.pathname)) return { kind: 'login' };
  if (/^\/auth\/register\/?$/.test(url.pathname)) return { kind: 'register' };
  // www and canonical links must share the same storage/session origin.
  url.protocol = origin.protocol;
  url.host = origin.host;
  return { kind: 'internal', url: url.toString(), path: url.pathname };
}

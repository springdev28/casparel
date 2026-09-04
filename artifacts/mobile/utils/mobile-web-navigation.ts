/** Decide whether a WebView URL stays in Casparel or leaves the app. */
export type MobileWebDestination =
  | { kind: 'internal'; url: string; path: string }
  | { kind: 'paywall' }
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
  // The public home page contains desktop marketing and the obsolete
  // "Coming to iOS & Android" panel. An authenticated native session must
  // never fall out of the product onto that page.
  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = '/dashboard';
  }
  return { kind: 'internal', url: url.toString(), path: url.pathname };
}

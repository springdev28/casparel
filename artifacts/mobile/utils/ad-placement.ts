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

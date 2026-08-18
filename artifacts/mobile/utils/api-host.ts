/**
 * Where the app talks to Casparel.
 *
 * `EXPO_PUBLIC_DOMAIN` is inlined by Metro at bundle time, and every path that
 * sets it — the Replit dev script, and the `env` block shared by all three EAS
 * build profiles — is outside the app. That is fine until one of them is
 * missed, and the failure it produces is the worst kind: a store build that
 * installs, launches, shows its login screen, and then cannot reach anything,
 * because a relative `/api/...` has no origin to resolve against on a phone.
 *
 * So the production host is the default rather than a value the build is
 * trusted to supply. An override still wins, which is what dev builds and
 * staging need; what it cannot do any more is silently resolve to nothing.
 */

/** The public deployment. Only ever wrong for a build that overrides it. */
const DEFAULT_DOMAIN = 'casparel.com';

function resolveDomain(): string {
  const configured = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (!configured) return DEFAULT_DOMAIN;
  // Tolerate a domain pasted in with its scheme or a trailing slash: these
  // come from environment variables typed by hand into a build dashboard.
  return configured.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/** Hostname only, e.g. `casparel.com`. */
export const apiDomain = resolveDomain();

/** Origin the API and every server-proxied asset is fetched from. */
export const apiOrigin = `https://${apiDomain}`;

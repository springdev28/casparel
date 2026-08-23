/**
 * @fileOverview Web domain role: centralizes Auth Redirect state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
const INTERNAL_ORIGIN = "https://casparel.invalid";
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const AUTH_ROUTE = /^\/auth\/(?:login|register)(?:\/|$)/;

/**
 * Return a same-app destination from an auth query string.
 *
 * URL parsing matters here: browser URL parsers treat backslashes like
 * slashes in special URLs, so a string such as `/\\evil.example` can become
 * a cross-origin URL even though it appears to begin with one slash.
 */
export function getSafeAuthNext(search: string): string | null {
  const candidate = new URLSearchParams(search).get("next");
  return getSafeInternalPath(candidate);
}

export function getSafeInternalPath(candidate: string | null): string | null {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    CONTROL_CHARACTER.test(candidate)
  ) {
    return null;
  }

  try {
    const parsed = new URL(candidate, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN || AUTH_ROUTE.test(parsed.pathname)) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function authRouteWithNext(
  authRoute: "/auth/login" | "/auth/register",
  next: string | null,
): string {
  const safeNext = getSafeInternalPath(next);
  return safeNext
    ? `${authRoute}?next=${encodeURIComponent(safeNext)}`
    : authRoute;
}

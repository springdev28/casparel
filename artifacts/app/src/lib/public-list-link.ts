/**
 * @fileOverview Web domain role: centralizes Public List Link state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
const SHARE_TOKEN = /^[A-Za-z0-9_-]{20,100}$/;

export function publicListPath(token: string): string | null {
  // Share tokens are opaque capabilities. Validate their bounded URL-safe shape
  // locally, but never infer ownership or visibility from their contents.
  const normalized = token.trim();
  return SHARE_TOKEN.test(normalized)
    ? `/lists/shared/${encodeURIComponent(normalized)}`
    : null;
}

export function publicListUrl(
  origin: string,
  basePath: string,
  token: string,
): string | null {
  const sharePath = publicListPath(token);
  if (!sharePath) return null;

  // Preserve non-root deployments and construct with URL rather than string
  // concatenation so the browser performs one consistent origin resolution.
  const normalizedBase = `/${basePath}`
    .replaceAll(/\/{2,}/g, "/")
    .replace(/\/$/, "");
  return new URL(`${normalizedBase}${sharePath}`, `${origin}/`).toString();
}

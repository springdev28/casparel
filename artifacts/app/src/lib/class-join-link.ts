/**
 * @fileOverview Web domain role: centralizes Class Join Link state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
const JOIN_CODE = /^[A-F0-9]{8}$/;

export function normalizeClassJoinCode(value: string): string | null {
  // Accept user-entered case/whitespace but emit one canonical code shape so a
  // copied link and a manually typed code reach the same server lookup.
  const normalized = value.trim().toUpperCase();
  return JOIN_CODE.test(normalized) ? normalized : null;
}

export function classJoinPath(code: string): string | null {
  const normalized = normalizeClassJoinCode(code);
  return normalized ? `/classes?join=${normalized}` : null;
}

export function classJoinUrl(
  origin: string,
  basePath: string,
  code: string,
): string | null {
  const joinPath = classJoinPath(code);
  if (!joinPath) return null;

  // Vite may host the SPA below `/`; preserve that base path without allowing
  // caller-provided duplicate slashes to produce a protocol-relative URL.
  const normalizedBase = `/${basePath}`.replaceAll(/\/{2,}/g, "/").replace(/\/$/, "");
  return new URL(`${normalizedBase}${joinPath}`, `${origin}/`).toString();
}

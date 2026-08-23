/**
 * @fileOverview Web domain role: centralizes Resource Share Link state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
function validResourceId(resourceId: number) {
  // Route IDs are positive database integers. Rejecting fractional/negative
  // values avoids emitting misleading links that can never resolve.
  return Number.isInteger(resourceId) && resourceId > 0;
}

export function resourceQuickReviewPath(resourceId: number): string | null {
  return validResourceId(resourceId)
    ? `/resources/${resourceId}?review=quick`
    : null;
}

export function resourceSaveIntentPath(resourceId: number): string | null {
  return validResourceId(resourceId)
    ? `/resources/${resourceId}?intent=save`
    : null;
}

export function resourceQuickReviewUrl(
  origin: string,
  basePath: string,
  resourceId: number,
): string | null {
  const reviewPath = resourceQuickReviewPath(resourceId);
  if (!reviewPath) return null;

  // Keep share links correct when the Vite app is deployed under a base path;
  // new URL also prevents an accidental protocol-relative destination.
  const normalizedBase = `/${basePath}`
    .replaceAll(/\/{2,}/g, "/")
    .replace(/\/$/, "");
  return new URL(`${normalizedBase}${reviewPath}`, `${origin}/`).toString();
}

export function requestsQuickReview(search: string): boolean {
  return new URLSearchParams(search).get("review") === "quick";
}

export function requestsSaveAfterAuth(search: string): boolean {
  return new URLSearchParams(search).get("intent") === "save";
}

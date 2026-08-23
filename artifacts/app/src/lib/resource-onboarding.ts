/**
 * @fileOverview Web domain role: centralizes Resource Onboarding state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
export function firstRunResourcePath(learningNeed = ""): string {
  const params = new URLSearchParams({ onboarding: "1" });
  const normalizedNeed = learningNeed.trim();
  if (normalizedNeed) params.set("goal", normalizedNeed);
  return `/resources?${params.toString()}`;
}

export const FIRST_RUN_RESOURCE_PATH = firstRunResourcePath();

export function isFirstRunResourceSearch(routeSearch: string): boolean {
  return new URLSearchParams(routeSearch).get("onboarding") === "1";
}

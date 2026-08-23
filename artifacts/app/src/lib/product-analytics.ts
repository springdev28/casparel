/**
 * @fileOverview Web domain role: centralizes Product Analytics state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
import type { ProductEventInput } from "@workspace/api-client-react";

const TOKEN_KEY = "schoolar_token";
const ONBOARDING_KEY = "schoolar_onboarding_activation_pending";

/**
 * Send a small, allowlisted first-party event. Callers must never include
 * search text, resource URLs, student writing, email addresses, or names.
 */
export async function trackProductEvent(event: ProductEventInput) {
  if (typeof window === "undefined") return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  try {
    await fetch("/api/analytics/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
      // Allows a final small event to finish during navigation without holding
      // the UI open. The server still validates and bounds the payload.
      keepalive: true,
    });
  } catch {
    // Product analytics must never interrupt the user workflow.
  }
}

export function beginOnboardingActivation() {
  try {
    // Session storage makes this funnel marker tab-scoped: refreshing or moving
    // between onboarding steps does not create a second activation attempt.
    const isNew = sessionStorage.getItem(ONBOARDING_KEY) !== "1";
    sessionStorage.setItem(ONBOARDING_KEY, "1");
    return isNew;
  } catch {
    return true;
  }
}

export function completeOnboardingActivation() {
  try {
    // Consume the marker so only the first completed core action after
    // onboarding is attributed to the onboarding activation funnel.
    if (sessionStorage.getItem(ONBOARDING_KEY) !== "1") return false;
    sessionStorage.removeItem(ONBOARDING_KEY);
    return true;
  } catch {
    return false;
  }
}

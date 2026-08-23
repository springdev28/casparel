/**
 * @fileOverview Web domain role: centralizes Client Telemetry state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
import { trackProductEvent } from "./product-analytics";
import { onCLS, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

export type WebVitalName = "LCP" | "INP" | "CLS" | "TTFB";
export type VitalRating = "good" | "needs-improvement" | "poor";
export type ClientErrorSource =
  | "react_boundary"
  | "window_error"
  | "unhandled_rejection";
export type ClientErrorKind =
  | "chunk_load"
  | "type_error"
  | "reference_error"
  | "range_error"
  | "syntax_error"
  | "network_error"
  | "unknown";

const VITAL_THRESHOLDS: Record<WebVitalName, [number, number]> = {
  LCP: [2_500, 4_000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  TTFB: [800, 1_800],
};

// Deduplicate by category and route family rather than message/stack. Messages
// may contain user data and high-cardinality stacks would turn one crash loop
// into an analytics flood.
const reportedErrors = new Set<string>();

export function vitalRating(name: WebVitalName, value: number): VitalRating {
  const [good, poor] = VITAL_THRESHOLDS[name];
  if (value <= good) return "good";
  if (value <= poor) return "needs-improvement";
  return "poor";
}

/** Return a low-cardinality route family without ids, tokens, or query text. */
export function telemetryRouteGroup(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first) return "landing";
  const known = new Set([
    "activities",
    "admin",
    "auth",
    "canvas",
    "classes",
    "dashboard",
    "forum",
    "goals",
    "guide",
    "lists",
    "messages",
    "people",
    "privacy",
    "profile",
    "resources",
    "schedule",
    "settings",
    "support",
    "terms",
    "tutorial",
  ]);
  return known.has(first) ? first : "other";
}

export function classifyClientError(error: unknown): ClientErrorKind {
  const value = error instanceof Error ? error : null;
  const safeMessage = value?.message.toLowerCase() ?? "";
  if (
    /loading chunk|chunkloaderror|dynamically imported module/.test(safeMessage)
  ) {
    return "chunk_load";
  }
  if (/failed to fetch|networkerror/.test(safeMessage)) return "network_error";
  if (value instanceof TypeError) return "type_error";
  if (value instanceof ReferenceError) return "reference_error";
  if (value instanceof RangeError) return "range_error";
  if (value instanceof SyntaxError) return "syntax_error";
  return "unknown";
}

export function trackClientError(
  source: ClientErrorSource,
  error: unknown,
): void {
  if (typeof window === "undefined") return;
  const errorKind = classifyClientError(error);
  const routeGroup = telemetryRouteGroup(window.location.pathname);
  const dedupeKey = `${source}:${errorKind}:${routeGroup}`;
  if (reportedErrors.has(dedupeKey)) return;
  reportedErrors.add(dedupeKey);
  void trackProductEvent({
    event: "client_error_observed",
    context: { source, errorKind, routeGroup },
  });
}

export function installClientTelemetry(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  const reportVital = (metric: Metric) => {
    const name = metric.name as WebVitalName;
    const rawValue = metric.value;
    if (!Number.isFinite(rawValue) || rawValue < 0) return;
    // Preserve enough CLS precision for its sub-one thresholds while rounding
    // millisecond metrics to keep event cardinality and payload size small.
    const value = name === "CLS" ? Number(rawValue.toFixed(3)) : Math.round(rawValue);
    void trackProductEvent({
      event: "web_vital_measured",
      context: {
        metric: name,
        value,
        rating: vitalRating(name, value),
        routeGroup: telemetryRouteGroup(window.location.pathname),
      },
    });
  };
  // The official library implements the complete field algorithms, including
  // INP interaction grouping, bfcache restoration and supported soft
  // navigations. Unsupported metrics simply do not call the reporter.
  onLCP(reportVital);
  onINP(reportVital);
  onCLS(reportVital);
  onTTFB(reportVital);
  const onWindowError = (event: ErrorEvent) =>
    trackClientError("window_error", event.error);
  const onUnhandledRejection = (event: PromiseRejectionEvent) =>
    trackClientError("unhandled_rejection", event.reason);

  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    window.removeEventListener("error", onWindowError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

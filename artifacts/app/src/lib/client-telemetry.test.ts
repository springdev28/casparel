/**
 * @fileOverview Verification role: exercises Client Telemetry.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import {
  classifyClientError,
  telemetryRouteGroup,
  vitalRating,
} from "./client-telemetry";

describe("client telemetry privacy and thresholds", () => {
  it("groups paths without retaining ids, share tokens, or query text", () => {
    expect(telemetryRouteGroup("/resources/427?query=private")).toBe("resources");
    expect(telemetryRouteGroup("/lists/shared/secret-token")).toBe("lists");
    expect(telemetryRouteGroup("/unknown/123")).toBe("other");
    expect(telemetryRouteGroup("/")).toBe("landing");
  });

  it("uses the published Core Web Vitals thresholds", () => {
    expect(vitalRating("LCP", 2_500)).toBe("good");
    expect(vitalRating("LCP", 2_501)).toBe("needs-improvement");
    expect(vitalRating("INP", 501)).toBe("poor");
    expect(vitalRating("CLS", 0.1)).toBe("good");
    expect(vitalRating("CLS", 0.251)).toBe("poor");
  });

  it("classifies errors without returning messages or stacks", () => {
    expect(classifyClientError(new TypeError("private learner text"))).toBe(
      "type_error",
    );
    expect(
      classifyClientError(new Error("Failed to fetch dynamically imported module")),
    ).toBe("chunk_load");
    expect(classifyClientError("raw rejection content")).toBe("unknown");
  });
});

/**
 * @fileOverview Verification role: exercises Auth Redirect.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import {
  authRouteWithNext,
  getSafeAuthNext,
  getSafeInternalPath,
} from "./auth-redirect";

describe("auth redirect safety", () => {
  it("preserves an internal class invite including its query string", () => {
    const target = "/classes?join=A1B2C3D4";
    const loginPath = authRouteWithNext("/auth/login", target);

    expect(loginPath).toBe(
      "/auth/login?next=%2Fclasses%3Fjoin%3DA1B2C3D4",
    );
    expect(getSafeAuthNext(loginPath.split("?")[1])).toBe(target);
  });

  it.each([
    "https://evil.example/classes",
    "//evil.example/classes",
    "/\\evil.example/classes",
    "javascript:alert(1)",
    "/classes\n/unsafe",
  ])("rejects an unsafe redirect target: %s", (target) => {
    expect(getSafeInternalPath(target)).toBeNull();
    expect(authRouteWithNext("/auth/login", target)).toBe("/auth/login");
  });

  it("rejects authentication loops", () => {
    expect(getSafeInternalPath("/auth/login?next=/dashboard")).toBeNull();
    expect(getSafeInternalPath("/auth/register")).toBeNull();
  });

  it("returns null when next is absent or invalid", () => {
    expect(getSafeAuthNext("language=en")).toBeNull();
    expect(getSafeAuthNext("next=%2F%2Fevil.example")).toBeNull();
  });
});

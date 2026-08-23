/**
 * @fileOverview Verification role: exercises Resource Onboarding.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import {
  FIRST_RUN_RESOURCE_PATH,
  firstRunResourcePath,
  isFirstRunResourceSearch,
} from "./resource-onboarding";

describe("resource onboarding", () => {
  it("routes a new account directly to a real search task", () => {
    expect(FIRST_RUN_RESOURCE_PATH).toBe("/resources?onboarding=1");
    expect(isFirstRunResourceSearch("onboarding=1")).toBe(true);
  });

  it("does not show first-run guidance during ordinary resource browsing", () => {
    expect(isFirstRunResourceSearch("view=library")).toBe(false);
  });

  it("prefills a real learning need without creating an unsafe route", () => {
    expect(firstRunResourcePath("  Calculus & limits  ")).toBe(
      "/resources?onboarding=1&goal=Calculus+%26+limits",
    );
  });
});

/**
 * @fileOverview Verification role: exercises Search Terms.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import { meaningfulSearchTerms } from "./searchTerms";

describe("meaningfulSearchTerms", () => {
  it("turns a goal title into flexible library terms", () => {
    expect(meaningfulSearchTerms("Master Full-Stack Development")).toEqual([
      "Full",
      "Stack",
      "Development",
    ]);
  });

  it("deduplicates terms and ignores generic goal verbs", () => {
    expect(meaningfulSearchTerms("Learn algebra and master algebra")).toEqual([
      "algebra",
    ]);
  });
});

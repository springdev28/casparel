/**
 * @fileOverview Verification role: exercises Dashboard Truth.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import { presentTeacherSignals, weakestTeacherSignal } from "./dashboard-truth";

describe("teacher dashboard truth", () => {
  it("does not turn a missing or empty response into demo learning claims", () => {
    expect(presentTeacherSignals(undefined)).toEqual([]);
    expect(presentTeacherSignals([])).toEqual([]);
    expect(weakestTeacherSignal(undefined)).toBeNull();
    expect(weakestTeacherSignal([])).toBeNull();
  });

  it("presents only evidence returned by the server", () => {
    const signals = [
      {
        concept: "Equivalent fractions",
        learnerCount: 4,
        averageUnderstanding: 1.5,
        stalledCount: 2,
        commonMisconception: "The denominator sets the size.",
      },
      {
        concept: "Common denominators",
        learnerCount: 6,
        averageUnderstanding: 3.2,
        stalledCount: 0,
        commonMisconception: null,
      },
    ];

    expect(presentTeacherSignals(signals)).toEqual([
      expect.objectContaining({
        concept: "Equivalent fractions",
        learnerCount: 4,
        detail: "The denominator sets the size.",
      }),
      expect.objectContaining({
        concept: "Common denominators",
        detail: "Average understanding: 3.2 of 4",
      }),
    ]);
    expect(weakestTeacherSignal(signals)?.concept).toBe("Equivalent fractions");
  });
});

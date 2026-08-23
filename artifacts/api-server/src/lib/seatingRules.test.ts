/**
 * @fileOverview Verification role: exercises Seating Rules.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import {
  depthPreferenceScore,
  describeSeatDepth,
  parseSeatingNote,
  seatingPreferenceReasons,
} from "./seatingRules";

describe("seating note rules", () => {
  it("treats an explicit back-row request as a position request, not a quiet-work claim", () => {
    const signals = parseSeatingNote(
      "He is tall, so he should sit at the back rows.",
    );
    expect(signals).toEqual({
      wantsFront: false,
      wantsBack: true,
      wantsQuiet: false,
    });
    expect(seatingPreferenceReasons(signals)).toEqual([
      "The private note explicitly requests a back-area seat.",
    ]);
  });

  it("does not turn quiet or independent work into an invented back-row request", () => {
    expect(
      parseSeatingNote("Quiet independent work suits this student."),
    ).toEqual({ wantsFront: false, wantsBack: false, wantsQuiet: true });
  });

  it("respects an explicit front-row request", () => {
    expect(parseSeatingNote("Seat her near the front row.")).toMatchObject({
      wantsFront: true,
      wantsBack: false,
    });
  });

  it("ranks the furthest custom row as the back even when its raw y value is below 70", () => {
    const signals = parseSeatingNote("Please place him at the back.");
    expect(depthPreferenceScore(62, 18, 62, signals)).toBeLessThan(
      depthPreferenceScore(40, 18, 62, signals),
    );
    expect(describeSeatDepth(62, 18, 62)).toBe("toward the back");
  });
});

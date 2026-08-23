/**
 * @fileOverview Verification role: guards resumable tutorial state against stale or malformed browser storage.
 * System connection: runs in the web package test suite before TutorialPage trusts a saved step or learning need.
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_TUTORIAL_DRAFT,
  parseTutorialDraft,
  tutorialProgressPercent,
} from "./tutorial-state";

describe("tutorial state", () => {
  it("restores the exact valid step and learning need", () => {
    expect(
      parseTutorialDraft(
        JSON.stringify({ step: 2, learningNeed: "Understand derivatives" }),
      ),
    ).toEqual({ step: 2, learningNeed: "Understand derivatives" });
  });

  it("rejects malformed, out-of-range, and oversized drafts", () => {
    expect(parseTutorialDraft("not-json")).toEqual(EMPTY_TUTORIAL_DRAFT);
    expect(
      parseTutorialDraft(JSON.stringify({ step: 7, learningNeed: "Biology" })),
    ).toEqual(EMPTY_TUTORIAL_DRAFT);
    expect(
      parseTutorialDraft(
        JSON.stringify({ step: 1, learningNeed: "x".repeat(301) }),
      ),
    ).toEqual(EMPTY_TUTORIAL_DRAFT);
  });

  it("reports bounded, accessible progress", () => {
    expect(tutorialProgressPercent(0)).toBe(33);
    expect(tutorialProgressPercent(2)).toBe(100);
    expect(tutorialProgressPercent(99)).toBe(100);
  });
});

/**
 * @fileOverview Verification role: exercises Step Activity.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Which of the five things it can offer, and why.
 *
 * Every branch rests on a fact the product actually holds. The test worth
 * having is the one that pins which fact wins when two disagree: a learner who
 * labelled a video as the thing to practise on has said something about their
 * own studying that the catalogue's idea of the file cannot overrule.
 */
import { describe, expect, it } from "vitest";
import { suggestStepActivity } from "./stepActivity";

describe("suggestStepActivity", () => {
  it("sends somebody to find something when the step has no resource", () => {
    expect(suggestStepActivity({})).toEqual({
      kind: "find",
      because: "no_resource",
      recallActivityId: null,
    });
  });

  it("chooses by what the material is", () => {
    expect(suggestStepActivity({ format: "video" }).kind).toBe("watch");
    expect(suggestStepActivity({ format: "podcast" }).kind).toBe("listen");
    expect(suggestStepActivity({ format: "interactive" }).kind).toBe("practise");
    expect(suggestStepActivity({ format: "article" }).kind).toBe("read");
    expect(suggestStepActivity({ format: "pdf" }).kind).toBe("read");
    // A format this build has not met still gets an answer, and reading is the
    // one that is true of almost anything.
    expect(suggestStepActivity({ format: "hologram" }).kind).toBe("read");
  });

  it("lets what the learner said outrank what the file is", () => {
    const suggestion = suggestStepActivity({ format: "video", role: "practice" });
    expect(suggestion.kind).toBe("practise");
    expect(suggestion.because).toBe("role");
  });

  it("does not let another role overrule the format", () => {
    // "explanation" says what it is for, not what to do with it; a video is
    // still watched.
    expect(suggestStepActivity({ format: "video", role: "explanation" }).kind).toBe("watch");
  });

  it("carries the learner's own study set through, when they have one", () => {
    expect(suggestStepActivity({ format: "article", recallActivityId: 7 })).toEqual({
      kind: "read",
      because: "format",
      recallActivityId: 7,
    });
    expect(suggestStepActivity({ format: "article" }).recallActivityId).toBeNull();
  });
});

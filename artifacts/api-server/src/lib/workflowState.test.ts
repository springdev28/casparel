import { describe, expect, it } from "vitest";
import { nextResourceWorkflowAction } from "./workflowState";

describe("nextResourceWorkflowAction", () => {
  it.each([
    [{ reviewed: false, saved: false, activityCreated: false, classShared: false }, "review"],
    [{ reviewed: true, saved: false, activityCreated: false, classShared: false }, "save"],
    [{ reviewed: true, saved: true, activityCreated: false, classShared: false }, "create_activity"],
    [{ reviewed: true, saved: true, activityCreated: true, classShared: false }, "share_class"],
    [{ reviewed: true, saved: true, activityCreated: true, classShared: true }, "complete"],
  ] as const)("chooses the next incomplete stage", (steps, expected) => {
    expect(nextResourceWorkflowAction(steps)).toBe(expected);
  });
});

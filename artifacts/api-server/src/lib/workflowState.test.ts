/**
 * @fileOverview Verification role: exercises Workflow State.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import { nextResourceWorkflowAction } from "./workflowState";

describe("nextResourceWorkflowAction", () => {
  it.each([
    [{ reviewed: false, saved: false, activityCreated: false, classShared: false, assignmentCreated: false }, "review"],
    [{ reviewed: true, saved: false, activityCreated: false, classShared: false, assignmentCreated: false }, "save"],
    [{ reviewed: true, saved: true, activityCreated: false, classShared: false, assignmentCreated: false }, "create_activity"],
    [{ reviewed: true, saved: true, activityCreated: true, classShared: false, assignmentCreated: false }, "share_class"],
    [{ reviewed: true, saved: true, activityCreated: true, classShared: true, assignmentCreated: false }, "complete"],
  ] as const)("chooses the next incomplete stage", (steps, expected) => {
    expect(nextResourceWorkflowAction(steps)).toBe(expected);
  });

  it("continues from class sharing to an assignment for teachers", () => {
    expect(nextResourceWorkflowAction({
      reviewed: true,
      saved: true,
      activityCreated: true,
      classShared: true,
      assignmentCreated: false,
    }, true)).toBe("assign_class");
  });

  it("completes the teacher journey after an assignment is created", () => {
    expect(nextResourceWorkflowAction({
      reviewed: true,
      saved: true,
      activityCreated: true,
      classShared: true,
      assignmentCreated: true,
    }, true)).toBe("complete");
  });
});

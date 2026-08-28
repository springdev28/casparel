/**
 * @fileOverview Verification role: exercises Goal Path.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import { listResourcesMissingFromPath, pathStepForResource } from "./goalPath";

describe("what a path is missing from its list", () => {
  it("is nothing when the path carries every resource the list holds", () => {
    expect(
      listResourcesMissingFromPath([{ resourceId: 4 }, { resourceId: 7 }], [4, 7]),
    ).toEqual([]);
  });

  it("is the resources added to the list since, in the list's order", () => {
    expect(
      listResourcesMissingFromPath([{ resourceId: 7 }], [7, 2, 9]),
    ).toEqual([2, 9]);
  });

  it("ignores steps with no resource, which every generated path is made of", () => {
    expect(listResourcesMissingFromPath([{}, { resourceId: null }], [5])).toEqual([5]);
  });

  it("does not report a resource twice because the list holds it twice", () => {
    expect(listResourcesMissingFromPath([], [3, 3])).toEqual([3]);
  });

  /*
   * The case a stored version number gets wrong. The learner attached this
   * resource to the goal by hand rather than through the list, so the path
   * already has it -- a counter would still say the list had moved on and
   * offer to add a second step for the same thing.
   */
  it("counts a resource attached to the goal directly as already on the path", () => {
    expect(listResourcesMissingFromPath([{ resourceId: 11 }], [11])).toEqual([]);
  });

  /*
   * And the other one: added to the list and taken out again is not drift,
   * because the list and the path agree once more.
   */
  it("reports nothing after a change to the list that was undone", () => {
    expect(listResourcesMissingFromPath([{ resourceId: 1 }], [1])).toEqual([]);
  });
});

describe("the step a resource becomes", () => {
  it("keeps a step title inside what the contract allows", () => {
    const step = pathStepForResource({
      id: 1,
      title: "x".repeat(400),
      subject: "Physics",
    });
    expect(step.title).toHaveLength(200);
    expect(step.query.length).toBeLessThanOrEqual(300);
  });

  it("names a resource whose title is only whitespace", () => {
    expect(pathStepForResource({ id: 1, title: "   ", subject: "Physics" }).title).toBe(
      "Saved resource",
    );
  });

  it("starts unfinished and points at its resource", () => {
    const step = pathStepForResource({ id: 42, title: "Vectors", subject: "Maths" });
    expect(step.completed).toBe(false);
    expect(step.resourceId).toBe(42);
    expect(step.query).toBe("Maths Vectors");
  });

  it("gives every step its own id", () => {
    const resource = { id: 1, title: "Vectors", subject: "Maths" };
    expect(pathStepForResource(resource).id).not.toBe(pathStepForResource(resource).id);
  });
});

/**
 * @fileOverview Backend domain role: centralizes Goal Path logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */

import { randomUUID } from "node:crypto";

/**
 * A path is a snapshot; the list it came from keeps moving.
 *
 * Building a goal from a Learning List copies the list's resources into steps
 * and then the two have nothing to do with each other. Add three resources to
 * the list next week and the path does not know, so a learner works through a
 * path that is quietly out of date and only finds out by noticing something is
 * not on it.
 *
 * Nothing here is stored. A recorded version number would answer "has the list
 * changed", and comparing what is actually in each answers "what does the path
 * not have" -- which is the question a learner can act on, and which cannot
 * drift because there is no counter to forget to bump. It is also right in the
 * two cases a counter gets wrong: a resource added to the list and taken out
 * again is not drift, and a resource the learner attached to the goal directly
 * is not missing from it.
 */

/** How a step refers to its resource, which is all this needs to know. */
export type ResourceCarryingStep = { resourceId?: number | null };

/**
 * The list's resources that no step of the path carries, in the list's order.
 *
 * Additions only, and that is a product decision rather than an omission. A
 * resource taken out of the list still has a step on the path, and that step
 * may be finished and carry a check-in a teacher has already read. Withdrawing
 * it because somebody tidied a list would delete evidence of work that
 * happened. So the path grows to follow its list and never shrinks.
 */
export function listResourcesMissingFromPath(
  steps: readonly ResourceCarryingStep[],
  listResourceIds: readonly number[],
): number[] {
  const onPath = new Set(
    steps.flatMap((step) =>
      typeof step.resourceId === "number" ? [step.resourceId] : [],
    ),
  );
  const missing: number[] = [];
  for (const id of listResourceIds) {
    // A list can hold the same resource twice; a path should not gain it twice
    // for that, so the first one claims it.
    if (onPath.has(id)) continue;
    onPath.add(id);
    missing.push(id);
  }
  return missing;
}

/**
 * The step a resource becomes on a path.
 *
 * Shared by the single attach and the catch-up with a list, because the
 * truncation is load-bearing and a second copy is how it gets lost: a resource
 * title has no length bound, a step title does, and a step over the contract's
 * limit fails the response parse *after* the write has already landed -- the
 * learner sees an error and the step is on their path anyway.
 */
export function pathStepForResource(resource: {
  id: number;
  title: string;
  subject: string;
}) {
  const title = resource.title.trim().slice(0, 200) || "Saved resource";
  return {
    id: randomUUID(),
    title,
    query: `${resource.subject} ${title}`.trim().slice(0, 300),
    completed: false,
    resourceId: resource.id,
  };
}

/**
 * A path in the order the caller asked for.
 *
 * Reordering is the one edit that is genuinely about the whole path, so it is
 * also the one most likely to carry stale work back with it: a client that
 * sends whole step objects sends whatever title and tick it last read, and a
 * rename or a tick made elsewhere in between is silently undone. Ids say only
 * what reordering means to say.
 *
 * A step the caller did not name keeps its relative place after the ones that
 * were named. That is what a step appended on another device should do — the
 * learner arranged the five they could see, and the sixth belongs after them,
 * not lost and not silently first. An id that is *not* on the path is
 * different: the caller is working from a path that has since changed, and
 * guessing what they meant is how the order they get stops being the order
 * they chose.
 */
export type PathOrder<T extends { id: string }> =
  | { steps: T[] }
  | { conflict: "unknown_step" | "duplicate_step" };

export function stepsInOrder<T extends { id: string }>(
  steps: readonly T[],
  stepIds: readonly string[],
): PathOrder<T> {
  if (new Set(stepIds).size !== stepIds.length) {
    return { conflict: "duplicate_step" };
  }
  const byId = new Map(steps.map((step) => [step.id, step]));
  const named: T[] = [];
  for (const id of stepIds) {
    const step = byId.get(id);
    if (!step) return { conflict: "unknown_step" };
    named.push(step);
  }
  const asked = new Set(stepIds);
  return { steps: [...named, ...steps.filter((step) => !asked.has(step.id))] };
}

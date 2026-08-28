/**
 * @fileOverview Verification role: exercises Ticking Touches One Step.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * No client ticks a step by sending the whole path back.
 *
 * A learning path is one JSON column, so a client that flips one `completed`
 * flag and writes the whole array back overwrites everything else about the
 * path as it was when that client last read it. Two devices ticking different
 * steps lose one of the ticks; a tick here and a resource attached on the
 * phone lose the resource. `POST /learning-goals/{id}/steps/{stepId}/completion`
 * exists so a tick moves one box under the goal's lock, and a database test
 * proves two concurrent completions both survive.
 *
 * The endpoint being right is not the same as it being used. It was built for
 * the phone, taken up by the goals page, and the sidebar and the adaptive
 * dashboard kept their whole-array writes -- so two of the three places a
 * step can be ticked on the web still had the defect the endpoint was built
 * to remove, and nothing failed. This reads the sources, because that is the
 * only thing that can tell a fixed call site from a fixed endpoint.
 *
 * Renaming, adding, deleting and reordering steps still send the path whole,
 * and that is left alone here: those are edits to the path rather than to one
 * step, and the goals page is the one screen that makes them.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Every client file that can put a tick on a learning path. */
const CLIENTS = [
  "artifacts/app/src/components/AppShell.tsx",
  "artifacts/app/src/pages/AdaptiveDashboardPage.tsx",
  "artifacts/app/src/pages/GoalsPage.tsx",
  "artifacts/mobile/app/goals/[id].tsx",
];

/**
 * The whole path mapped over with a `completed` flag flipped inside it.
 *
 * `.map` rather than any mention of `pathSteps`, and that distinction is the
 * whole test: the correct write reads the step it is about with
 * `pathSteps.find(...)` and then sends `{ completed: !step.completed }` to the
 * one-step endpoint, which a looser pattern flags as the very defect it is the
 * fix for. Rebuilding the array is what makes a tick overwrite its neighbours.
 *
 * Matched across lines because that is how each of these was written -- the
 * ternary sat three lines below the `.map(`.
 */
const WHOLE_PATH_TICK = /pathSteps\.map\([\s\S]{0,300}?completed:\s*!/;

describe.each(CLIENTS)("%s", (file) => {
  const source = readFileSync(resolve(repository, file), "utf8");

  it("does not tick a step by writing the whole path back", () => {
    expect(WHOLE_PATH_TICK.test(source)).toBe(false);
  });

  it("ticks through the endpoint that touches one step", () => {
    // Every file listed here draws a tickable box; one that stops doing so
    // should leave this list rather than quietly pass without ticking at all.
    expect(source).toContain("useCompleteGoalStep");
  });
});

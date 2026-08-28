/**
 * @fileOverview Verification role: exercises Path Edits Touch One Step.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * No client changes a path by sending the whole thing back.
 *
 * A learning path is one JSON column, so a client that rebuilds the array and
 * writes it back writes the path as it was when that client last read it.
 * Everything that arrived in between is undone: a tick from the phone, a
 * resource attached from the save sheet, a step brought forward from the list.
 * There is an endpoint per edit -- add, rename, delete, reorder, tick -- and
 * each takes the goal's lock, so the read and the write are one moment.
 *
 * The endpoints being right is not the same as them being used. The tick
 * endpoint was built for the phone, taken up by the goals page, and the
 * sidebar and the adaptive dashboard kept their whole-array writes -- so two
 * of the three places a step could be ticked on the web still had the defect
 * the endpoint was built to remove, and nothing failed. This reads the
 * sources, because that is the only thing that can tell a fixed call site
 * from a fixed endpoint.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Every client file that can change a learning path. */
const CLIENTS = [
  "artifacts/app/src/components/AppShell.tsx",
  "artifacts/app/src/pages/AdaptiveDashboardPage.tsx",
  "artifacts/app/src/pages/GoalsPage.tsx",
  "artifacts/mobile/app/goals/[id].tsx",
];

/**
 * A `pathSteps` array being handed to a server write.
 *
 * The shape it catches is `data: { pathSteps: ... }` on a goal mutation, in
 * any of the ways the four of these wrote it -- a `.map` with a flag flipped,
 * a spread with one appended, a `.filter` with one removed, a swapped copy.
 * Anything that reaches `data:` is a whole-path write whatever it is made of.
 *
 * Reading the path is not writing it: `goal.pathSteps.find(...)` to get the
 * step an edit is about, `.map` to move a tick in the local cache, `.length`
 * for a count. Those are everywhere and are correct, which is why this looks
 * for the payload key rather than for any mention of the array.
 */
const WHOLE_PATH_WRITE = /data:\s*\{[\s\S]{0,80}?\bpathSteps\s*:/;

describe.each(CLIENTS)("%s", (file) => {
  const source = readFileSync(resolve(repository, file), "utf8");

  it("does not send a whole path to a server write", () => {
    expect(WHOLE_PATH_WRITE.test(source)).toBe(false);
  });

  it("changes a step through an endpoint that touches one step", () => {
    // Every file listed here can change a path; one that stops doing so
    // should leave this list rather than quietly pass without changing any.
    expect(
      /use(CompleteGoalStep|AddGoalStep|RenameGoalStep|DeleteGoalStep|ReorderGoalSteps)/.test(
        source,
      ),
    ).toBe(true);
  });
});

/**
 * @fileOverview Verification role: exercises Every Audit Runs.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * An audit nothing runs is a file, not a check.
 *
 * These scripts are where most of what is actually known about this product
 * comes from: whether a screen comes up, whether a control has a name,
 * whether a failed request is reported honestly, whether a written row
 * reaches the page that lists it. They are also the easiest thing here to
 * write and then forget to wire up, because the run that proves one works is
 * the author's own terminal, and nothing afterwards notices its absence.
 *
 * So: every script meant to be run from a command line -- which is what the
 * shebang says -- has to be named in a workflow. It cannot tell whether the
 * workflow runs on the right branch or with the right server up. It can tell
 * that nobody wired it in at all, which is the only failure that costs the
 * whole check rather than part of it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Where scripts a person or a workflow invokes directly live. */
const SCRIPT_DIRS = [
  "scripts",
  "artifacts/app/scripts",
  "artifacts/mobile/scripts",
];

/**
 * Scripts that are runnable and deliberately not in a workflow, each with the
 * reason. Kept short: a long list here means the rule has stopped meaning
 * anything.
 */
const NOT_IN_CI = new Map<string, string>([
  [
    "scripts/smoke-check.test.mjs",
    "the test for a script rather than a script; it runs in this suite's own vitest pass",
  ],
  [
    "scripts/search-verdict.mjs",
    "a maintainer's tool for judging one search by hand, with no pass or fail to report",
  ],
  [
    "artifacts/app/scripts/generate-seo.mjs",
    "generates committed files rather than checking anything; seo-check.mjs is the check",
  ],
  [
    "artifacts/mobile/scripts/build-icons.mjs",
    "generates committed app icons rather than checking anything",
  ],
  [
    "artifacts/mobile/scripts/store-screenshots.mjs",
    "produces store listing images on demand, for a submission rather than a build",
  ],
]);

const workflowText = readdirSync(join(repository, ".github/workflows"))
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .map((name) => readFileSync(join(repository, ".github/workflows", name), "utf8"))
  .join("\n");

/**
 * The workflows, plus the package scripts they invoke.
 *
 * A workflow does not always name a file. `pnpm --filter @workspace/mobile run
 * check:release` runs one, and reading the workflows alone reported that
 * script as wired to nothing — a false alarm that would have been "fixed" by
 * adding a second way to run it. A rule that cannot see one of the two normal
 * ways to call something is a rule that teaches people to work around it.
 */
const workflows = (() => {
  const scripts: string[] = [];
  for (const dir of ["", "artifacts/app", "artifacts/mobile", "artifacts/api-server", "scripts"]) {
    const file = join(repository, dir, "package.json");
    let manifest: { scripts?: Record<string, string> };
    try {
      manifest = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    for (const [name, body] of Object.entries(manifest.scripts ?? {})) {
      if (new RegExp(`run\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(workflowText)) {
        scripts.push(body);
      }
    }
  }
  return [workflowText, ...scripts].join("\n");
})();

/** Every script whose first line says it is meant to be executed. */
const runnable = SCRIPT_DIRS.flatMap((dir) =>
  readdirSync(join(repository, dir))
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => join(repository, dir, name))
    .filter((full) => readFileSync(full, "utf8").startsWith("#!"))
    .map((full) => relative(repository, full)),
);

describe("scripts meant to be run", () => {
  it("finds them", () => {
    // A moved directory would empty this list, and an empty list passes the
    // rule below while checking nothing.
    expect(runnable.length).toBeGreaterThan(15);
    expect(runnable).toContain("artifacts/mobile/scripts/audit-failures.mjs");
  });

  it.each(runnable)("%s is named in a workflow", (script) => {
    const exempt = NOT_IN_CI.get(script);
    if (exempt) {
      expect(exempt.length).toBeGreaterThan(20);
      return;
    }
    expect(workflows).toContain(script.split("/").pop());
  });
});

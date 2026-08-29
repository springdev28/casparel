/**
 * @fileOverview Verification role: exercises Every Phone Screen Is Rendered.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Every screen the phone app can show is shown to something.
 *
 * `audit-languages.mjs` renders a list of routes in each language and fails if
 * one comes up broken, untranslated, or with a control a screen reader cannot
 * name. That list is hand-written, and a route that is not on it is not
 * checked by anything: the source scan reads strings without knowing which
 * file draws them, and the failure audit renders the same hand-written list.
 *
 * Three screens were in that state. `messages/[id]` is where a person reads
 * and writes a conversation; `class/[id]` is a class and its members;
 * `resource/[id]` is a catalogue entry with its reviews and the control that
 * puts it in a library. All three are reached by tapping a row on a screen
 * that *was* audited, which is exactly why nobody noticed -- the list looked
 * complete because every tab was on it.
 *
 * So this reads the app directory, turns each route file into the address
 * Expo Router serves it at, and requires the audit to name it. It cannot say
 * whether the render is a good one. It can say that a screen has never been
 * drawn by anything, which is the state those three were in.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const APP = join(repository, "artifacts/mobile/app");

/**
 * Screens deliberately not rendered by the audit, each with its reason.
 *
 * Kept explicit and expected to stay short. A growing list here is the signal
 * that the rule has stopped meaning anything.
 */
const NOT_RENDERED = new Map<string, string>([]);

function routeFiles(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found.push(...routeFiles(join(dir, entry.name), `${prefix}${entry.name}/`));
      continue;
    }
    if (!entry.name.endsWith(".tsx")) continue;
    if (entry.name === "_layout.tsx") continue;
    found.push(`${prefix}${entry.name}`);
  }
  return found.sort();
}

/**
 * The address Expo Router serves a file at.
 *
 * `index.tsx` is its directory, `[id].tsx` takes an id, and the `(tabs)`
 * group is served at the root -- which is why the dashboard's address is `/`
 * and not `/(tabs)`. The audit's list carries both spellings for the tabs,
 * so both are accepted below rather than resolved here.
 */
function addressOf(file: string): string {
  const withoutExtension = file.replace(/\.tsx$/, "");
  const path = `/${withoutExtension.replace(/\/?index$/, "")}`;
  return path.replace(/\[[^\]]+\]/g, "{id}") || "/";
}

describe("the phone app's screens", () => {
  it("renders every route somewhere", () => {
    const audit = readFileSync(
      join(repository, "artifacts/mobile/scripts/audit-languages.mjs"),
      "utf8",
    );
    const rendered = new Set<string>();
    for (const match of audit.matchAll(/\bpath: "([^"]+)"/g)) {
      const path = match[1].replace(/\/\d+(?=\/|$)/g, "/{id}");
      rendered.add(path);
      // The tabs group is served at the root: `/` and `/(tabs)/index` are the
      // same screen, and the audit spells it the way a reader's URL bar does.
      if (path === "/") rendered.add("/(tabs)");
      if (path.startsWith("/(tabs)/")) rendered.add(path.slice("/(tabs)".length));
    }

    const missing = routeFiles(APP)
      .map(addressOf)
      .filter((address) => {
        if (NOT_RENDERED.has(address)) return false;
        const inTabs = address.replace(/^\/\(tabs\)/, "");
        return !rendered.has(address) && !rendered.has(inTabs || "/");
      });

    expect(
      missing,
      "no audit has ever drawn these screens; add them to audit-languages.mjs, " +
        "or name them in NOT_RENDERED with a reason",
    ).toEqual([]);
  });

  /*
   * The second half, and the one that finds bugs.
   *
   * Rendering a screen against a stubbed server says it comes up. It says
   * nothing about the state a reader on a train is in, and that state is
   * where two of these screens were wrong: both said "not found" when the
   * request had merely failed, which reads as "this was deleted" and offers
   * nothing to do about it. Neither had ever been rendered failing, because
   * the failure audit's list was three screens shorter than the language
   * audit's and nothing held the two against each other.
   */
  it("renders every screen that reads something under a server that will not answer", () => {
    const languages = readFileSync(
      join(repository, "artifacts/mobile/scripts/audit-languages.mjs"),
      "utf8",
    );
    const failures = readFileSync(
      join(repository, "artifacts/mobile/scripts/audit-failures.mjs"),
      "utf8",
    );

    // The two files agree on spelling: both write the address a reader's URL
    // bar would show, so the paths compare directly.
    const rendered = new Set(
      [...languages.matchAll(/\bpath: "([^"]+)"/g)].map((match) => match[1]),
    );
    const failing = new Set([...failures.matchAll(/\bpath: "([^"]+)"/g)].map((match) => match[1]));
    // Bounded at the object's own closing brace: reading to the end of the
    // file sweeps up anything else shaped like a row of string keys, and a
    // screen named there would look excused from a run it was in.
    const skipsAt = failures.indexOf("export const SKIPS");
    const skipBlock = failures.slice(skipsAt, failures.indexOf("\n};", skipsAt));
    const skipped = new Set(
      [...skipBlock.matchAll(/^  "([^"]+)":/gm)].map((match) => match[1]),
    );

    const unchecked = [...rendered].filter(
      (path) => !failing.has(path) && !skipped.has(path),
    );

    expect(
      unchecked.sort(),
      "these screens are rendered against a working server and never against " +
        "one that will not answer; add them to audit-failures.mjs, or name " +
        "them in its SKIPS with a reason",
    ).toEqual([]);
  });
});

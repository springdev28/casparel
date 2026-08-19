/**
 * The browser audits read the same pages, or say which they skip and why.
 *
 * There are three, and each asks a different question of a rendered page: does
 * it paint (audit-pages), is it in the reader's language (audit-translation),
 * and does it keep the bridge off text the user wrote (audit-user-content).
 * Each carries its own list of signed-in routes, and lists drift.
 *
 * They had. The render audit grew to sixteen routes; the translation audit
 * still named the six it started with. So ten pages -- schedule, classes,
 * goals, forum, messages, activities, lists, people, canvas, admin -- were
 * rendered on every build and never once read in another language, and the
 * product looked fully translated because the pages that were checked were.
 * Adding them found 36 strings a Spanish reader saw in English.
 *
 * Nothing could have noticed. Every audit passed; each was complete about the
 * list it had. Only holding the lists against each other shows the gap, which
 * is the same shape of bug as a search provider missing from the source
 * registry: two correct halves that disagree.
 *
 * A route may still be left out of an audit -- some need fixtures nobody has
 * written. It has to be named in that file's SKIPS list with a reason, so the
 * omission is a decision on the page rather than a list that quietly fell
 * behind.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scripts = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../app/scripts",
);

const read = (name: string) => readFileSync(resolve(scripts, name), "utf8");

/**
 * The routes a script names, from the string literal its list is built from.
 *
 * Parsed rather than imported: these are standalone scripts that open a
 * browser and a server on import, which is not something a unit test should
 * make happen.
 */
function routesIn(source: string, listName: string): string[] {
  const at = source.indexOf(`const ${listName} = (`);
  if (at < 0) return [];
  const literal = source.slice(at, source.indexOf(")\n", at));
  return [...literal.matchAll(/"([^"]*)"/g)]
    .flatMap((m) => m[1].split(","))
    .map((route) => route.trim())
    .filter((route) => route.startsWith("/"));
}

/** Routes a script names as `AUDIT_..._PAGES` env defaults. */
const renders = routesIn(read("audit-pages.mjs"), "SIGNED_IN_PAGES");
const translations = routesIn(read("audit-translation.mjs"), "SIGNED_IN_PAGES");
const userContent = routesIn(read("audit-user-content.mjs"), "PAGES");

/**
 * Routes an audit leaves out on purpose, and why.
 *
 * `/catalog`, `/settings` and `/plans` are in the translation audit and not in
 * the user-content one because they render nothing a user typed: a price, a
 * plan name and a toggle are all product wording, so there is no field for the
 * bridge to damage.
 */
const USER_CONTENT_SKIPS = new Set(["/catalog", "/settings", "/plans"]);

describe("the browser audits", () => {
  it("each name a list this test can read", () => {
    // Renaming a list or changing how it is built would make every comparison
    // below compare two empty sets and pass.
    expect(renders.length, "audit-pages.mjs").toBeGreaterThanOrEqual(10);
    expect(translations.length, "audit-translation.mjs").toBeGreaterThanOrEqual(10);
    expect(userContent.length, "audit-user-content.mjs").toBeGreaterThanOrEqual(10);
  });

  it("read every page in the reader's language that they render at all", () => {
    const unread = renders.filter((route) => !translations.includes(route));
    expect(
      unread,
      "these routes are rendered on every build and never read in another " +
        "language; add them to SIGNED_IN_PAGES in audit-translation.mjs",
    ).toEqual([]);
  });

  it("check user content on every page they read", () => {
    const unchecked = translations.filter(
      (route) => !userContent.includes(route) && !USER_CONTENT_SKIPS.has(route),
    );
    expect(
      unchecked,
      "these routes are read for translation but never checked for user " +
        "content the bridge could rewrite; add them to PAGES in " +
        "audit-user-content.mjs, or to USER_CONTENT_SKIPS here with a reason",
    ).toEqual([]);
  });

  it("names a reason for every page it skips", () => {
    // The other direction: a skip for a route that no longer exists is a
    // stale excuse, and the next real omission would hide behind it.
    for (const route of USER_CONTENT_SKIPS) {
      expect(
        translations,
        `${route} is skipped by the user-content audit but is not a route ` +
          `any audit renders any more`,
      ).toContain(route);
    }
  });
});

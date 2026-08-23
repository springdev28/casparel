/**
 * @fileOverview Verification role: exercises Audits Cover The Same Pages.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
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
 *
 * The lists agreeing is not enough on its own, which took a second bug to
 * show. All four named `/canvas`. The router declares `/canvases`, and its
 * catch-all redirects anything unmatched to `/resources` -- so every audit
 * loaded the resources page a second time, passed on it, and reported it as
 * canvas coverage. Four lists in perfect agreement about a page that does not
 * exist, and the real canvases page never audited once. So the routes are
 * held against App.tsx too: a page an audit claims to check has to be a page
 * the router actually serves.
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
const reachable = [
  ...routesIn(read("audit-reachable.mjs"), "PUBLIC_PAGES"),
  ...routesIn(read("audit-reachable.mjs"), "SIGNED_IN_PAGES"),
];
const fits = routesIn(read("audit-text-fits.mjs"), "PAGES");

/**
 * Routes an audit leaves out on purpose, and why.
 *
 * `/catalog`, `/settings` and `/plans` are in the translation audit and not in
 * the user-content one because they render nothing a user typed: a price, a
 * plan name and a toggle are all product wording, so there is no field for the
 * bridge to damage. `/guide` and `/tutorial` are there for the same reason and
 * more plainly: both are written documents shipped in the bundle.
 */
const USER_CONTENT_SKIPS = new Set([
  "/catalog",
  "/settings",
  "/plans",
  // The guide and the tour are written documents. Every string on both is
  // product prose shipped in the bundle -- there is no field on either page
  // that a reader can type into, so there is nothing for the bridge to damage.
  "/guide",
  "/tutorial",
]);

/**
 * Every path the router declares, with its parameters as they are written.
 *
 * `<Route path="/profile/:userId">` becomes `/profile/:userId` here, and an
 * audit naming `/resources/101` matches it by shape: same number of segments,
 * and each segment either identical or a `:parameter` the audit filled in.
 */
const ROUTES = [
  ...readFileSync(
    resolve(scripts, "../src/App.tsx"),
    "utf8",
  ).matchAll(/<Route\s+path="([^"]+)"/g),
].map((match) => match[1]);

/** Does the router serve this address, parameters included. */
function served(route: string): boolean {
  const asked = route.split("/");
  return ROUTES.some((declared) => {
    const parts = declared.split("/");
    if (parts.length !== asked.length) return false;
    return parts.every(
      (part, index) => part.startsWith(":") || part === asked[index],
    );
  });
}

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

  it("found the router's own list of routes", () => {
    expect(ROUTES.length, "no <Route path> found in App.tsx").toBeGreaterThanOrEqual(20);
  });

  it.each([
    ["audit-pages.mjs", () => renders],
    ["audit-translation.mjs", () => translations],
    ["audit-user-content.mjs", () => userContent],
    ["audit-reachable.mjs", () => reachable],
    ["audit-text-fits.mjs", () => fits],
  ])("only checks pages the router serves: %s", (_name, get) => {
    /*
     * An address the router does not declare is not a page that fails to
     * load -- the catch-all redirects it to /resources, which renders
     * perfectly. So the audit passes, on the wrong page, and reports the
     * coverage of a page it never opened. There is no output anywhere that
     * looks different from the real thing.
     */
    const nowhere = get().filter((route) => !served(route));
    expect(
      nowhere,
      "these are not routes in App.tsx, so the catch-all redirects them to " +
        "/resources: the audit renders the resources page again, passes, and " +
        "reports it as coverage of a page nobody has ever audited",
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

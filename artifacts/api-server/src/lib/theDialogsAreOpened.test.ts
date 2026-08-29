/**
 * @fileOverview Verification role: exercises The Dialogs Are Opened.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Every page with a dialog has one opened by something.
 *
 * A dialog is markup that does not exist until somebody opens it. The render
 * audit loaded pages and never pressed anything, so about forty of them --
 * every sheet, every confirmation, every form behind a button -- were checked
 * by nothing at all: not their heading levels, not their fields, not the
 * names a screen reader reads off the controls inside.
 *
 * The first eight opened found five form fields with no accessible name: both
 * search boxes in the schedule's pickers, the invitee search beside them, and
 * a note on a recommendation. All four sit inside dialogs, which is exactly
 * why the run that renders every page in five palettes had never seen one.
 *
 * So this holds the audit's list against the pages that have dialogs. A page
 * may wait its turn -- the backlog below is honest about which are not opened
 * yet -- but it has to be written down, because the whole failure here was a
 * surface nobody had counted.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const web = join(repository, "artifacts/app/src");

/**
 * Pages with a dialog that nothing opens yet, and what is in them.
 *
 * A backlog, not a policy, and written down rather than left to be
 * rediscovered -- the same treatment the contract's undescribed routes get.
 * Delete a row by adding the page to OPENED in audit-pages.mjs.
 */
const NOT_OPENED_YET: Record<string, string> = {
  "ActivitiesPage.tsx": "the study-activity editor and its share sheet",
  "AdminPage.tsx": "the account management sheet, reached through its own fetch wrapper",
  "CanvasPage.tsx": "share, details and the library picker on the board",
  "CanvasesPage.tsx": "the new-canvas dialog",
  "ClassDetailPage.tsx":
    "six: invite, assignment, seating, Google Classroom import, resource list, notes",
  "ForumPage.tsx": "the new-post composer and the report sheet",
  "GoalsPage.tsx": "the goal editor and the template preview",
  "ProfilePage.tsx": "the profile editor",
};

/** Route paths in App.tsx, with the page component each one renders. */
function routesByComponent(): Map<string, string> {
  const source = readFileSync(join(web, "App.tsx"), "utf8");
  const byComponent = new Map<string, string>();
  for (const match of source.matchAll(
    /<Route\s+path="([^"]+)"([\s\S]*?)(?=<Route\s+path=|<\/Switch>)/g,
  )) {
    const path = match[1];
    const component = match[2].match(/component=\{(\w+)\}|<(\w+Page)\b/);
    const name = component?.[1] ?? component?.[2];
    if (!name) continue;
    // The first route wins: /classes/:id is declared before /classes, and the
    // detail page is the one with the dialogs.
    if (!byComponent.has(name)) byComponent.set(name, path);
  }
  return byComponent;
}

/** Page files that render a dialog or a sheet. */
function pagesWithDialogs(): string[] {
  const dir = join(web, "pages");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".tsx"))
    .filter((name) => /<(Dialog|Sheet)Content\b/.test(readFileSync(join(dir, name), "utf8")))
    .sort();
}

/** The routes audit-pages.mjs opens something on. */
function openedRoutes(): Set<string> {
  const source = readFileSync(
    join(repository, "artifacts/app/scripts/audit-pages.mjs"),
    "utf8",
  );
  const at = source.indexOf("const OPENED = [");
  const list = source.slice(at, source.indexOf("\n];", at));
  return new Set([...list.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]));
}

describe("the dialogs", () => {
  it("found the pages, the routes and the list", () => {
    // Any of these silently returning nothing would make the rule below pass
    // by having nothing to check.
    expect(pagesWithDialogs().length).toBeGreaterThanOrEqual(10);
    expect(routesByComponent().size).toBeGreaterThanOrEqual(20);
    expect(openedRoutes().size).toBeGreaterThanOrEqual(4);
  });

  it("are opened on every page that has one, or the page is on the backlog", () => {
    const routes = routesByComponent();
    const opened = openedRoutes();
    const unopened = pagesWithDialogs()
      .filter((file) => {
        if (file in NOT_OPENED_YET) return false;
        const route = routes.get(file.replace(/\.tsx$/, ""));
        // A page the router does not reach cannot be opened by a path.
        if (!route) return false;
        return ![...opened].some((path) => sameShape(path, route));
      })
      .sort();

    expect(
      unopened,
      "these pages have a dialog and nothing opens one; add an entry to " +
        "OPENED in audit-pages.mjs, or a row to NOT_OPENED_YET here saying " +
        "what is still unopened",
    ).toEqual([]);
  });

  it("has no backlog row for a page that is opened after all", () => {
    // A stale row is where the next real omission hides, and here it is worse
    // than usual: the row reads as a description of what is unchecked.
    const routes = routesByComponent();
    const opened = openedRoutes();
    const stale = Object.keys(NOT_OPENED_YET).filter((file) => {
      const route = routes.get(file.replace(/\.tsx$/, ""));
      return route ? [...opened].some((path) => sameShape(path, route)) : false;
    });

    expect(stale.sort(), "these are on the backlog and are opened").toEqual([]);
  });
});

/** `/lists/44` matches the router's `/lists/:id`. */
function sameShape(asked: string, declared: string): boolean {
  const left = asked.split("?")[0].split("/");
  const right = declared.split("/");
  if (left.length !== right.length) return false;
  return right.every((part, index) => part.startsWith(":") || part === left[index]);
}

/**
 * Every route the server registers is either in openapi.yaml or listed here
 * with a reason.
 *
 * openapi.yaml is hand-written and everything downstream is generated from it:
 * the React hooks, the zod schemas, the types. A route the file does not name
 * is therefore a route no generated client can call -- not a compile error,
 * not a test failure, just a feature that quietly does not exist on any
 * surface built from the contract.
 *
 * That is not hypothetical. The study-activities endpoints had been served
 * since the feature shipped and described nowhere, so the phone app did not
 * have flashcards -- there was no hook to call. Nothing could have noticed:
 * the server tests passed because the routes work, and the client compiled
 * because it never mentioned them.
 *
 * When this file was written the server registered 184 routes and the contract
 * described 113. Of the 71 missing, most were whole features -- the forum, the
 * canvas, direct messages, the assignment workflow -- and each is a thing the
 * phone cannot do for the same reason flashcards could not be done.
 *
 * A route may legitimately stay out of the contract. An OAuth callback is a
 * URL a browser is redirected to, not something a client calls; a webhook is
 * posted to by somebody else's server; an iCal feed is subscribed to by a
 * calendar app. Those belong in UNDESCRIBED with the reason, which is the
 * point of this test: the gap becomes a decision recorded per route instead of
 * a list that fell behind.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const routesDir = resolve(here, "../routes");
const specPath = resolve(here, "../../../../lib/api-spec/openapi.yaml");

/**
 * Routes served on purpose without a contract entry, and why.
 *
 * Two kinds: URLs somebody else's software calls, which no generated client
 * would ever want; and the admin surface, which the web app reaches through a
 * hand-rolled `adminRequest` fetch in AdminPage.tsx. The second kind is a
 * decision that could be revisited -- an admin app on a phone would need
 * them -- rather than a rule.
 */
const UNDESCRIBED: Record<string, string> = {
  "GET /auth/google/callback":
    "a URL Google redirects a browser to, not a call any client makes",
  "GET /calendar/google/callback":
    "a URL Google redirects a browser to, not a call any client makes",
  "GET /calendar/{icalSecret}/feed.ics":
    "an iCal feed a calendar app subscribes to; it serves text/calendar, not JSON",
  "POST /webhooks/revenuecat":
    "posted to by RevenueCat's servers, authenticated by its own shared secret",
  "GET /resources/oembed":
    "the oEmbed endpoint other sites call to embed a Casparel resource",

  // The admin surface. AdminPage.tsx calls these through its own fetch
  // wrapper rather than a generated hook, so they are undescribed on purpose
  // for now. Worth describing the day anything but that page needs them.
  "GET /admin/users": "admin surface, called through AdminPage's own fetch",
  "GET /admin/users/{id}/details":
    "admin surface, called through AdminPage's own fetch",
  "PATCH /admin/users/{id}": "admin surface, called through AdminPage's own fetch",
  "PATCH /admin/users/{id}/ban":
    "admin surface, called through AdminPage's own fetch",
  "DELETE /admin/users/{id}/ban":
    "admin surface, called through AdminPage's own fetch",
  "PATCH /admin/users/{id}/teacher-verification":
    "admin surface, called through AdminPage's own fetch",
  "PATCH /admin/users/{id}/classes/{classId}":
    "admin surface, called through AdminPage's own fetch",
  "PATCH /admin/users/{id}/classes/{classId}/membership":
    "admin surface, called through AdminPage's own fetch",
  "PATCH /admin/users/{id}/work/{category}/{itemId}":
    "admin surface, called through AdminPage's own fetch",
  "DELETE /admin/users/{id}/work/{category}/{itemId}":
    "admin surface, called through AdminPage's own fetch",
  "GET /admin/resources/review-queue":
    "admin surface, called through AdminPage's own fetch",
  "PATCH /admin/resources/{id}/verification":
    "admin surface, called through AdminPage's own fetch",
  "POST /admin/resources/verification/bulk":
    "admin surface, called through AdminPage's own fetch",
};

/**
 * Features the server has and the contract does not, so no generated client
 * can reach them.
 *
 * This is a backlog, not a policy, and it is written down rather than left to
 * be rediscovered. Direct messages came off this list; each entry that
 * follows is a thing the phone app cannot do. Delete an entry by describing
 * its endpoints in openapi.yaml. A key is a path prefix, matched by shape,
 * so a parameter's name here need not match the route's.
 */
const NOT_DESCRIBED_YET: Record<string, string> = {
  "/forum": "the forum: posts, comments, votes, materials, reports",
  "/canvases": "the collaborative canvas and its sharing",
  "/classes/{id}/assignments": "assignments, class analytics, the continue queue",
  "/classes/{id}/analytics": "assignments, class analytics, the continue queue",
  "/assignments": "assignments, class analytics, the continue queue",
  "/workflow": "assignments, class analytics, the continue queue",
  "/learning-goal-templates": "goal templates and cloning one",
  "/users/me/access": "the account's own entitlements",
  "/classes/{id}/shared-lists": "lists a class shares",
  "/resources/{id}/recommend": "a student recommending a resource to a class",
};

/** "METHOD /path" for every route any router registers, with {param} params. */
function routesTheServerServes(): Map<string, string> {
  const found = new Map<string, string>();
  for (const name of readdirSync(routesDir)) {
    if (!name.endsWith(".ts") || name.includes(".test.")) continue;
    const source = readFileSync(join(routesDir, name), "utf8");
    // `router.get("/x", …)` and `router.get(["/x", "/y"], …)`. The array form
    // is why this is not a one-line regex: sourceReview registers two paths
    // for one handler, and reading only the first made a described route look
    // unserved.
    for (const call of source.matchAll(
      /router\.(get|post|put|patch|delete)\(\s*(\[[^\]]*\]|(["'`])[^"'`]+\3)/g,
    )) {
      const method = call[1].toUpperCase();
      for (const literal of call[2].matchAll(/["'`]([^"'`]+)["'`]/g)) {
        found.set(
          `${method} ${literal[1].replace(/:([A-Za-z0-9_]+)/g, "{$1}")}`,
          name,
        );
      }
    }
  }
  return found;
}

/** "METHOD /path" for every operation openapi.yaml declares. */
function routesTheContractDescribes(): Set<string> {
  const described = new Set<string>();
  let inPaths = false;
  let path: string | null = null;
  for (const line of readFileSync(specPath, "utf8").split("\n")) {
    if (/^paths:/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths && /^[a-z]/.test(line)) inPaths = false;
    if (!inPaths) continue;
    const isPath = line.match(/^ {2}(\/\S*):\s*$/);
    if (isPath) {
      path = isPath[1];
      continue;
    }
    const isVerb = line.match(/^ {4}(get|post|put|patch|delete):\s*$/);
    if (isVerb && path) described.add(`${isVerb[1].toUpperCase()} ${path}`);
  }
  return described;
}

/** Parameter names differ between the two files; their positions do not. */
const shape = (route: string) => route.replace(/\{[^}]+\}/g, "{}");

describe("openapi.yaml and the routes the server registers", () => {
  const served = routesTheServerServes();
  const described = routesTheContractDescribes();

  it("finds routes on both sides, so a parser that broke cannot pass", () => {
    // Both halves are read by regex from files that are free to be reformatted.
    // A parser that silently matches nothing makes every other assertion here
    // vacuously true, which is the failure mode this whole file exists to
    // prevent in the first place.
    expect(served.size).toBeGreaterThan(150);
    expect(described.size).toBeGreaterThan(100);
  });

  it("describes every route, or says why not", () => {
    const describedShapes = new Set([...described].map(shape));
    const missing = [...served.keys()]
      .filter((route) => !describedShapes.has(shape(route)))
      .filter((route) => !(route in UNDESCRIBED))
      .filter(
        (route) =>
          !Object.keys(NOT_DESCRIBED_YET).some((prefix) =>
            shape(route.slice(route.indexOf(" ") + 1)).startsWith(shape(prefix)),
          ),
      )
      .sort();
    expect(
      missing,
      "These routes are served and the contract does not name them, so no " +
        "generated client can call them and no surface built from the " +
        "contract has the feature. Describe them in lib/api-spec/openapi.yaml " +
        "and run `pnpm --filter @workspace/api-spec run codegen`, or add them " +
        "to UNDESCRIBED here with the reason they stay out.",
    ).toEqual([]);
  });

  it("does not describe a route the server never registers", () => {
    const servedShapes = new Set([...served.keys()].map(shape));
    const phantom = [...described]
      .filter((route) => !servedShapes.has(shape(route)))
      .sort();
    expect(
      phantom,
      "The contract describes these and the server serves none of them, so " +
        "every generated client is typed against a 404.",
    ).toEqual([]);
  });

  it("keeps the backlog honest: each entry is a feature still missing", () => {
    const servedPaths = [...served.keys()].map((r) =>
      shape(r.slice(r.indexOf(" ") + 1)),
    );
    const stale = Object.keys(NOT_DESCRIBED_YET).filter(
      (prefix) => !servedPaths.some((path) => path.startsWith(shape(prefix))),
    );
    expect(
      stale,
      "NOT_DESCRIBED_YET names routes the server no longer serves. Remove " +
        "the entry; a backlog nobody prunes stops being read.",
    ).toEqual([]);
  });
});

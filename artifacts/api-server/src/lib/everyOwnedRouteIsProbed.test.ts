/**
 * @fileOverview Verification role: exercises Every Owned Route Is Probed.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Every way into somebody else's work is asked for by somebody else.
 *
 * `e2e-authorization.mjs` is the only thing here that can see a missing
 * ownership check. A handler that forgets to compare the row's owner against
 * the caller returns 200 with the right shape and renders fine; the sole way
 * to notice is to ask for the row as a second account and find that it comes
 * back. That script does exactly that, and it is hand-written.
 *
 * Which is the gap this closes. Adding an endpoint does not add a probe, and
 * nothing noticed: seven new writes and reads reached inside a learning goal
 * -- add a step, rename one, delete one, reorder them, tick one, catch up
 * with a list, read what a step asks for -- and the script still asked about
 * the two that existed when it was written. Each is its own handler with its
 * own ownership check to forget.
 *
 * So this reads the contract, takes every method and path under a family of
 * rows that belong to one account, and requires the script to name it. It
 * cannot tell whether the probe is a good one; it can tell that nobody
 * thought about this endpoint at all, which is the state the seven were in.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * Families whose rows belong to one account, and which the script creates one
 * of. A family listed here has every one of its `{id}` routes required; one
 * that is not listed is not checked, so adding a family to the script is what
 * brings it under this rule.
 */
const OWNED = [
  "/learning-goals/",
  "/lists/",
  "/canvases/",
  "/study-activities/",
  "/schedule/",
  "/study-sessions/",
];

/**
 * Routes under an owned family that are deliberately not owner-scoped, each
 * with the reason it is reachable by design. Kept explicit, and short: a
 * growing list here is the signal that the rule has stopped meaning anything.
 */
const NOT_OWNER_SCOPED = new Map<string, string>([
  [
    "POST /lists/{id}/share",
    "shares a list into a class; refusal is by class membership, which e2e-class-access.mjs covers",
  ],
  [
    "GET /study-activities/shared/{token}",
    "a share link, reachable by anyone holding the token and by design: it takes no auth, is keyed on an unguessable token rather than on an owner, and returns classId: null so the copy cannot be traced to a class",
  ],
]);

/**
 * "METHOD /path" for every operation the contract declares.
 *
 * Read line by line rather than through a YAML parser, the same way
 * contractDescribesEveryRoute.test.ts reads it: nothing in this package
 * depends on a YAML library, and one added for a test is a dependency the
 * server ships around.
 */
function contractRoutes(): string[] {
  const described: string[] = [];
  let inPaths = false;
  let path: string | null = null;
  for (const line of readFileSync(
    resolve(repository, "lib/api-spec/openapi.yaml"),
    "utf8",
  ).split("\n")) {
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
    if (isVerb && path) described.push(`${isVerb[1].toUpperCase()} ${path}`);
  }
  return described;
}

const script = readFileSync(
  resolve(repository, "scripts/e2e-authorization.mjs"),
  "utf8",
);

/** The (method, path) pairs the script asks Ben to try. */
const probed = (() => {
  const found: Array<{ method: string; segments: string[] }> = [];
  // ["POST", `/api/learning-goals/${id}/steps/order`, …] and ["GET", "/api/…"]
  const entry = /\[\s*"(GET|POST|PATCH|PUT|DELETE)"\s*,\s*[`"]([^`"]+)[`"]/g;
  for (const match of script.matchAll(entry)) {
    const path = match[2].replace(/^\/api/, "");
    found.push({ method: match[1], segments: path.split("/").filter(Boolean) });
  }
  return found;
})();

/** A contract segment is a wildcard when it names a parameter. */
function matches(contractPath: string, probe: string[]): boolean {
  const wanted = contractPath.split("/").filter(Boolean);
  if (wanted.length !== probe.length) return false;
  return wanted.every((segment, index) =>
    segment.startsWith("{") ? true : segment === probe[index],
  );
}

const required = contractRoutes().filter((route) => {
  const path = route.split(" ")[1];
  return OWNED.some((family) => path.startsWith(family)) && path.includes("{");
});

describe("the authorization probe", () => {
  it("covers a family of routes worth covering", () => {
    // A guard on the guard: a contract or a parser change that made `required`
    // empty would leave this file passing while checking nothing.
    expect(required.length).toBeGreaterThan(15);
  });

  it.each(required)("asks a stranger for %s", (route) => {
    const [method, path] = route.split(" ");
    const exempt = NOT_OWNER_SCOPED.get(route);
    if (exempt) {
      expect(exempt.length).toBeGreaterThan(20);
      return;
    }
    expect(
      probed.some(
        (probe) => probe.method === method && matches(path, probe.segments),
      ),
    ).toBe(true);
  });
});

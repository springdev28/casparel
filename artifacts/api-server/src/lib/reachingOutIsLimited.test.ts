/**
 * @fileOverview Verification role: exercises Reaching Out Is Limited.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * A route that fetches a URL somebody typed is rate limited.
 *
 * Everything under /api has the global limiter, a hundred requests a minute.
 * That is a ceiling on this server's own work. It is not a ceiling on what
 * this server does to somebody else's: a handler that fetches a supplied URL
 * turns one account into a hundred outbound requests a minute aimed wherever
 * that account chooses, which is a different thing from a hundred reads of a
 * page here.
 *
 * `fetchPublicText` is careful about *where* it will go -- it re-checks the
 * address at every redirect hop, which is the bypass that catches naive
 * guards -- and says nothing about how often. `POST /resources` was limited
 * and `POST /resources/prefetch`, which does the same outbound work for the
 * same form, was not.
 *
 * Only the routes that reach an arbitrary address are required here. Fetching
 * Google's API with a token the account connected is bounded by having
 * connected one, and its address is not the caller's to choose.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const routesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../routes");

/** Helpers that take a URL from the request and go to it. */
const REACHES_A_SUPPLIED_URL = /\b(fetchPublicText|checkUrlReachable|classifySubmission)\b/;

/**
 * The middleware a route is registered with, as code rather than as text.
 *
 * Comments are stripped first, and that is not tidiness. The first version of
 * this read the first few hundred characters of the registration and looked
 * for the word "limiter" -- and the comment *explaining* why the limiter was
 * there satisfied it, so removing the limiter itself left the check passing.
 * A guard a comment can satisfy is a guard that describes the code instead of
 * reading it.
 */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Each route registration in a file, with the body up to the next one. */
function registrations(source: string) {
  const starts = [...source.matchAll(/\nrouter\./g)].map((m) => m.index!);
  return [...source.matchAll(/router\.(get|post|patch|put|delete)\(\s*\n?\s*"([^"]+)"/g)].map(
    (match) => {
      const from = match.index!;
      const to = starts.find((start) => start > from) ?? source.length;
      const body = source.slice(from, to);
      // Everything between the path and the handler: the middleware chain.
      const chain = withoutComments(body).split(/async\s*\(/)[0] ?? "";
      return { route: `${match[1].toUpperCase()} ${match[2]}`, body, chain };
    },
  );
}

const reaching = readdirSync(routesDir)
  .filter((name) => name.endsWith(".ts") && !name.includes(".test."))
  .flatMap((name) =>
    registrations(readFileSync(join(routesDir, name), "utf8"))
      .filter(({ body }) => REACHES_A_SUPPLIED_URL.test(withoutComments(body)))
      .map(({ route, chain }) => ({ route, where: name, chain })),
  );

describe("routes that fetch a URL somebody supplied", () => {
  it("finds the ones that do", () => {
    // A renamed helper would empty this list, and an empty list passes the
    // rule below without checking anything.
    expect(reaching.map(({ route }) => route)).toContain("POST /resources/prefetch");
  });

  it.each(reaching)("$route is rate limited beyond the global ceiling", ({ chain }) => {
    expect(/\b\w*[Ll]imiter\b/.test(chain)).toBe(true);
  });
});

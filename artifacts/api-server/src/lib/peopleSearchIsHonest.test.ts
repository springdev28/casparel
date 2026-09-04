/**
 * @fileOverview Verification role: guards how the People page describes its two searches.
 * System connection: runs in the package test pipeline; reads the web page's
 * source, because what is claimed to the reader is the thing under test.
 */
/**
 * The People page runs two different searches, and must never blur them.
 *
 * One queries Casparel's own user profiles, which is a database this product
 * owns and which contains only the people who signed up. The other asks a
 * provider about public profiles on the web. They have different coverage,
 * different privacy rules and different failure modes, so they are offered as
 * separate choices and described separately.
 *
 * Two claims are specifically forbidden. The first is telling somebody that a
 * search "found nobody" when it never ran — a disabled provider and an empty
 * result are different facts, and only one of them is worth rewriting a query
 * over. The second is implying that Casparel's own account index covers the
 * whole internet, which is the kind of quiet overstatement that makes every
 * other claim in a product suspect.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const page = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/src/pages/PeoplePage.tsx",
  ),
  "utf8",
);

describe("the People page", () => {
  it("offers the two searches as separate, named choices", () => {
    // A single "search people" box that silently spans both would leave the
    // reader unable to tell which index answered them.
    expect(page).toContain('data-testid="people-source-filter"');
    expect(page).toMatch(/profileSource/);
    expect(page).toMatch(/"schoolar"\s*\|\s*"social"|"social"\s*\|\s*"schoolar"/);
  });

  it("reads whether public web search is configured before describing a result", () => {
    expect(page).toContain("capabilities?.publicProfileSearch === false");
  });

  it("says a disabled search was not run, rather than that it found nobody", () => {
    const disabledBranch = page.slice(page.indexOf("publicProfileSearchOff ?"));
    expect(disabledBranch).toContain("turned off");
    expect(disabledBranch).toMatch(/no\s*\n?\s*search was run|no search was run/);
    // The empty-result copy must not be what a disabled search shows.
    const disabledCopyEnd = disabledBranch.indexOf(") : (");
    expect(disabledBranch.slice(0, disabledCopyEnd)).not.toContain(
      "No verified public profiles found",
    );
  });

  it("never claims the Casparel account index covers the whole internet", () => {
    for (const overstatement of [
      /search(?:es|ing)? the (?:entire|whole) (?:web|internet)/i,
      /every (?:profile|person) on the (?:web|internet)/i,
      /all of the (?:web|internet)/i,
    ]) {
      expect(page).not.toMatch(overstatement);
    }
  });

  it("offers a Clear that resets the query, the filters and the results", () => {
    const clear = page.slice(
      page.indexOf("function clearSearch"),
      page.indexOf("function clearSearch") + 600,
    );
    // Leaving stale results under cleared filters is the failure this guards:
    // the screen would show answers to a question no longer on it.
    expect(clear).toContain("setQuery(\"\")");
    expect(clear).toContain("setSubject(\"\")");
    expect(clear).toContain("setRole(\"all\")");
    expect(clear).toContain("setAllSocialPeople([])");
    expect(clear).toContain("setHasSearched(false)");
  });

  it("tells a rate-limited reader that, rather than reporting a failure", () => {
    expect(page).toContain("socialRateLimited");
    expect(page).toMatch(/daily search limit/i);
  });
});

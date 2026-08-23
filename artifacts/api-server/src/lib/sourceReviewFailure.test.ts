/**
 * @fileOverview Verification role: exercises Source Review Failure.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * When a source review fails, the reader is told which failure it was.
 *
 * The panel rendered one sentence for all of them: "Could not retrieve source
 * information. Please try again later." The server never says anything so
 * vague. It distinguishes a deep report already running ("please wait for it
 * to finish"), a daily limit, a monthly limit, the service-wide budget and the
 * AI provider being unreachable, and it sends Retry-After with the ones that
 * have a clock.
 *
 * Collapsing those into one sentence is not merely unhelpful, it is wrong:
 * somebody whose *monthly* allowance is spent was told to try again later, and
 * got the same words as somebody hitting a five-minute provider outage. This
 * was reported from production, where the panel showed a red line and a Close
 * button and no way to find out anything more.
 *
 * The second half matters as much. Deep research failing does not mean the
 * source cannot be checked -- the quick check reads the maintained registry,
 * needs no AI, spends no allowance, and works when the provider is down. It is
 * offered right there, so a failed report costs one click rather than the
 * answer.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(
  resolve(here, "../../../app/src/pages/ResourceDetailPage.tsx"),
  "utf8",
);
const route = readFileSync(resolve(here, "../routes/sourceReview.ts"), "utf8");

describe("a failed source review", () => {
  it("reads the files it is about", () => {
    expect(panel).toContain("SourceReviewPanel");
    expect(route).toContain("source-review");
  });

  it("shows the server's own sentence", () => {
    expect(panel).toContain("const failureMessage");
    expect(
      panel,
      "the panel must read the error body, not print a fixed line",
    ).toMatch(/\{ data\?: \{ error\?: string \} \}/);
    expect(panel).toContain("<p className=\"text-sm text-destructive-text\">{failureMessage}</p>");
  });

  it("keeps the generic line only as a last resort", () => {
    // Still needed: a network failure has no body to quote.
    const generic = "Could not retrieve source information. Please try again later.";
    expect(panel).toContain(generic);
    expect(
      panel.indexOf(generic) > panel.indexOf("const failureMessage"),
      "the generic sentence must be the fallback inside failureMessage, not the only branch",
    ).toBe(true);
  });

  it("offers the free check when deep research fails", () => {
    expect(panel).toContain("canFallBackToQuick");
    expect(panel).toContain("Run the free source check instead");
    expect(panel).toMatch(/mode === "deep" && isError/);
  });

  it("does not answer a reader with a log line", () => {
    expect(
      route,
      "the client shows this string, so it has to be a sentence",
    ).toContain("Deep research is unavailable right now.");
    expect(route).not.toMatch(/error: "Failed to fetch source review"/);
  });
});

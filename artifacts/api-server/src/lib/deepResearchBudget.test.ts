/**
 * @fileOverview Verification role: exercises Deep Research Budget.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Deep research has to be able to produce what it is asked for.
 *
 * The prompt demands a nuanced 700-1000 word report AND a structured object
 * with fifteen required fields, several of them arrays of mentions carrying
 * URLs. It was configured with max_output_tokens 1800, which cannot hold both:
 * the model stopped mid-object, JSON.parse threw, and the handler quietly fell
 * back to the free registry check. The user paid an allowance, waited, and got
 * the cheap check back - wearing a "Quick" badge, because the fallback stamped
 * one.
 *
 * Nothing about that failure was visible: no error, no log, and a response
 * that looked like a different feature. These assertions pin the three
 * settings that caused it and the two properties that made it invisible.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AI_OPERATION_BOUNDS } from "@workspace/plan-economics";

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../routes/sourceReview.ts"),
  "utf8",
);

/** Roughly what the prompt asks for: ~1000 words of prose plus the JSON. */
const MIN_OUTPUT_TOKENS = 4000;

describe("the deep research request can afford its own prompt", () => {
  it("allows enough output for the report the prompt asks for", () => {
    expect(AI_OPERATION_BOUNDS.deepResearch.maxOutputTokens).toBeGreaterThanOrEqual(
      MIN_OUTPUT_TOKENS,
    );
  });

  it("does not ask the web search for the smallest possible context", () => {
    expect(AI_OPERATION_BOUNDS.deepResearch.searchContextSize).not.toBe("low");
  });

  it("does not run the reasoning at the lowest effort", () => {
    expect(AI_OPERATION_BOUNDS.deepResearch.reasoningEffort).not.toBe("low");
  });
});

describe("a failed deep run does not disguise itself", () => {
  it("keeps the deep badge rather than stamping quick", () => {
    const start = source.indexOf("function deepResearchFallback");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("\n}", start));
    expect(body).toContain('mode: "deep"');
  });

  it("says a deep report was attempted and did not arrive", () => {
    const start = source.indexOf("function deepResearchFallback");
    const body = source.slice(start, source.indexOf("\n}", start));
    expect(body).toMatch(/Deep research did not return/i);
  });

  it("logs why, so a repeat is diagnosable rather than silent", () => {
    expect(source).toContain("Deep research response did not parse");
    expect(source).toContain("incomplete_details");
  });
});

/**
 * @fileOverview Verification role: exercises Seating Is Not Ai.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The seating planner may not be sold as AI, because it is not one.
 *
 * It is deterministic: pattern rules over seat positions, front distance,
 * desk-mates and the teacher's own notes. There is no model call anywhere in
 * it, which is why the server's refusal for an unentitled teacher is worded
 * carefully and consumes no AI allowance.
 *
 * The upsell said the opposite. "AI seating suggestions require Pro" was the
 * sentence in the panel, and "AI seating-plan suggestions are included with
 * Pro" was the toast -- the two sentences a teacher reads immediately before
 * paying, both claiming a capability the feature does not have. In a product
 * whose entire pitch is that it tells you what a thing actually is, an
 * overclaim on the paywall is the most expensive place to put one.
 *
 * So the pairing is banned outright in what a reader sees. "Explainable
 * seating assistant" is the name; the honest description of the mechanism is
 * in the panel beside it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const roots = [
  resolve(here, "../../../app/src"),
  resolve(here, "../../../mobile/app"),
  resolve(here, "../../../mobile/components"),
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(full) ? [full] : [];
  });
}

/**
 * AI used as the thing seating *is*, rather than as something beside it.
 *
 * The adjacency matters. Several sentences in the product name both in one
 * breath and are exactly right to: the AI disclaimer says "AI discovery and
 * deep research generate suggestions ... The seating planner is rule-based
 * rather than an AI model", and the plans copy lists AI allowances and the
 * seating planner as separate lines. A rule that merely looked for both words
 * flagged all twelve of those and would have taught the next reader to delete
 * the test.
 *
 * What is banned is the phrase that makes the claim: AI modifying seating.
 */
const CLAIM = /\bAI[- ](?:powered |driven |based )?seating|seating[^."]{0,40}\bpowered by AI/i;

function offences(): string[] {
  const found: string[] = [];
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (CLAIM.test(line)) found.push(`${file}:${index + 1} ${line.trim()}`);
        });
    }
  }
  return found;
}

describe("the seating planner", () => {
  it("finds files to check", () => {
    expect(roots.flatMap(sourceFiles).length).toBeGreaterThan(20);
  });

  it("is never described as AI", () => {
    expect(
      offences(),
      "the planner is rule-based; saying AI on the paywall sells something " +
        "the feature does not do",
    ).toEqual([]);
  });
});

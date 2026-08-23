/**
 * @fileOverview Verification role: exercises Plan Copy Keeps Its Own Rules.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The rules plan-copy.ts states about itself, enforced.
 *
 * Its header lays out four, two of them introduced as "wording rules that
 * already burned this product once each":
 *
 *   - Nothing may say "unlimited": only administrator accounts are uncapped,
 *     and none of these cards are for administrators.
 *   - The seating planner is rule-based and must never be described as AI.
 *   - Annual is two months free against twelve times monthly.
 *   - Role plans undercut the generic plan of the same level, because they are
 *     specialised rather than premium.
 *
 * All four were true and none was checked. A comment is a good place to record
 * why a rule exists and a poor place to keep it: the first two are exactly the
 * kind of wording somebody adds back in a hurry, and the second two are
 * arithmetic that reads fine at a glance while being wrong by a month.
 *
 * The two claims are not decoration. "Unlimited" against a finite cap is a
 * promise the server will break in front of a paying customer, and calling the
 * seating planner AI is a claim about how a tool that arranges real children
 * in a real room actually works.
 *
 * Prices are read from the same file for the same reason the allowances are in
 * paywallPromisesWhatIsGiven.test.ts: it is the hand-kept mirror of what the
 * store dashboards are configured to, and nothing else compares the numbers in
 * it to each other.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/src/lib/plan-copy.ts",
  ),
  "utf8",
);

/** The file's own prose, which states the rules rather than following them. */
const withoutComments = source.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");

/** One block per card, from its `tier:` to the next. */
const cards = (() => {
  const starts = [
    ...withoutComments.matchAll(/\n\s*tier:\s*"([\w-]+)"(?:\s+as\s+\w+)?\s*,/g),
  ];
  return starts.map((start, index) => ({
    tier: start[1],
    text: withoutComments.slice(
      start.index,
      index + 1 < starts.length ? starts[index + 1].index : withoutComments.length,
    ),
  }));
})();

/** Monthly and annual, in dollars, for the cards that carry a price. */
const priced = cards.flatMap(({ tier, text }) => {
  const match = /monthly:\s*"US\$([\d.]+)",\s*\n?\s*annual:\s*"US\$([\d.]+)"/.exec(text);
  return match
    ? [{ tier, monthly: Number(match[1]), annual: Number(match[2]) }]
    : [];
});

const priceOf = (tier: string) => priced.find((entry) => entry.tier === tier);

describe("plan-copy.ts", () => {
  it("has cards and prices this test can read", () => {
    // Both lists coming back empty is how this file would pass while checking
    // nothing at all.
    expect(cards.length, "no tier cards found").toBeGreaterThanOrEqual(9);
    expect(priced.length, "no prices found").toBeGreaterThanOrEqual(6);
  });

  it("never says a plan is unlimited", () => {
    /*
     * Every plan on this page is capped. The word belongs to administrator
     * accounts, which are not sold, so anywhere it appears here it is a
     * promise the server is going to break -- in front of somebody who paid
     * for it.
     */
    const said = withoutComments
      .split("\n")
      .filter((line) => /\bunlimited\b/i.test(line))
      .map((line) => line.trim().slice(0, 80));
    expect(said, "a card claims an allowance the server caps").toEqual([]);
  });

  it("never describes the seating planner as AI", () => {
    /*
     * It is rule-based. Saying otherwise is a claim about how a tool that
     * arranges real children in a real classroom reaches its answer.
     *
     * Adjacency, not co-occurrence: "the explainable seating planner, and 60
     * AI discovery searches" is one card listing two separate things and is
     * fine. What is not fine is the two ideas joined -- "AI seating", "AI-
     * powered seating planner", "seating planner uses AI".
     */
    const claims = withoutComments
      .split("\n")
      .filter((line) =>
        /\bAI[\s-]?\w{0,10}\s*seating|seating[\s\w]{0,20}\b(?:AI|artificial intelligence)\b/i.test(
          line,
        ),
      )
      .map((line) => line.trim().slice(0, 90));
    expect(claims, "the seating planner is rule-based").toEqual([]);
  });

  it.each(priced.map((entry) => [entry.tier, entry] as const))(
    "prices %s at twelve months minus two",
    (_tier, entry) => {
      /*
       * "Two months free against 12× monthly" is the promise. Rounding to a
       * .99 ending moves it by a cent or two, so the assertion is that the
       * discount is between 1.9 and 2.1 months rather than exactly 2 -- tight
       * enough that a year priced at eleven months, or at ten, fails.
       */
      const monthsFree = 12 - entry.annual / entry.monthly;
      expect(
        monthsFree,
        `US$${entry.monthly}/mo and US$${entry.annual}/yr is ` +
          `${monthsFree.toFixed(2)} months free, not two`,
      ).toBeGreaterThan(1.9);
      expect(
        monthsFree,
        `US$${entry.monthly}/mo and US$${entry.annual}/yr gives away ` +
          `${monthsFree.toFixed(2)} months, which is more than the two the ` +
          `ladder is priced on`,
      ).toBeLessThan(2.1);
    },
  );

  it("prices a role plan under the generic plan of the same level", () => {
    /*
     * The header's reasoning: role plans are specialised, not premium, and
     * the generic plan carries a small flexibility premium for working on any
     * account role. A role plan that crept above its generic sibling would
     * invert that and nothing would say so.
     */
    for (const level of ["plus", "pro"]) {
      const generic = priceOf(level);
      expect(generic, `no ${level} card to compare against`).toBeTruthy();
      for (const role of ["student", "teacher"]) {
        const specialised = priceOf(`${role}-${level}`);
        if (!specialised) continue;
        expect(
          specialised.monthly,
          `${role}-${level} is US$${specialised.monthly} against ` +
            `${level} at US$${generic!.monthly}; the specialised plan is ` +
            `meant to undercut the flexible one`,
        ).toBeLessThan(generic!.monthly);
      }
    }
  });
});

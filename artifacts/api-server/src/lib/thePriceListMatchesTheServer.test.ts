/**
 * @fileOverview Verification role: exercises The Price List Matches The Server.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Every number on the price list is a number the server enforces.
 *
 * `plan-copy.ts` is what somebody reads before paying: "400 study activities",
 * "8 deep research reports a day", "8 classes, up to 150 members each".
 * `entitlements.ts` is what the server actually allows. They are two hand-kept
 * tables in two packages with no reference between them, and the difference
 * between them is a promise a customer paid for and did not get.
 *
 * No audit can see it. The plans page renders, translates, fits its box and
 * says the same thing in both languages; the sentence is simply not true of
 * the running product. It is the same shape of defect as the guide claiming
 * six languages, with money attached.
 *
 * So this reads both tables and holds every counted noun on a tier's card
 * against the tier's row on the server. It cannot check the words -- whether
 * "Adaptive study dashboard" is real is not a thing a test knows -- but every
 * number is checkable, and the numbers are what a buyer compares.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AI_RATES_BY_TIER, CAPACITY_BY_TIER } from "./entitlements.js";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const planCopy = join(repository, "artifacts/app/src/lib/plan-copy.ts");
const phonePaywall = join(repository, "artifacts/mobile/app/paywall.tsx");

/**
 * The nouns a card counts, and where the server keeps that number.
 *
 * Ordered longest-first so "deep research reports a day" is read before
 * "deep research reports", and "classes" before "class".
 */
const COUNTED: Array<{ phrase: RegExp; of: (tier: string) => number | undefined }> = [
  {
    phrase: /\b([\d,]+) study activities\b/g,
    of: (tier) => capacity(tier)?.["study-activities"],
  },
  {
    phrase: /\b([\d,]+) learning goals\b/g,
    of: (tier) => capacity(tier)?.["learning-goals"],
  },
  {
    phrase: /\b([\d,]+) resource lists\b/g,
    of: (tier) => capacity(tier)?.["resource-lists"],
  },
  { phrase: /\b([\d,]+) canvases\b/g, of: (tier) => capacity(tier)?.canvases },
  {
    phrase: /\b([\d,]+) classes?\b/g,
    of: (tier) => capacity(tier)?.["classes-owned"],
  },
  {
    phrase: /up to ([\d,]+) members\b/g,
    of: (tier) => capacity(tier)?.["class-members"],
  },
  {
    phrase: /\b([\d,]+) AI discovery searches a day\b/g,
    of: (tier) => rates(tier)?.searchPerDay,
  },
  {
    phrase: /\b([\d,]+) deep research reports a day\b/g,
    of: (tier) => rates(tier)?.deepPerDay,
  },
  {
    phrase: /up to ([\d,]+) per 30 days\b/g,
    of: (tier) => rates(tier)?.deepPerMonth,
  },
  {
    phrase: /\b([\d,]+) deep research reports per 30 days\b/g,
    of: (tier) => rates(tier)?.deepPerMonth,
  },
];

function capacity(tier: string) {
  return (CAPACITY_BY_TIER as Record<string, Record<string, number>>)[tier];
}

function rates(tier: string) {
  return (AI_RATES_BY_TIER as Record<string, Record<string, number>>)[tier];
}

/**
 * Each card as its tier and the lines under it.
 *
 * The blurb is deliberately left out. It is a sentence written for reading --
 * "One class of up to 30 with manual seating" -- and holding prose to the
 * same rule would either fail on wording that is true or force the wording
 * to be written for the parser. The bulleted lines are the specification.
 */
function cards(): Array<{ tier: string; lines: string[] }> {
  const source = readFileSync(planCopy, "utf8");
  const found: Array<{ tier: string; lines: string[] }> = [];
  for (const match of source.matchAll(/tier:\s*"([a-z-]+)"/g)) {
    const after = source.slice(match.index);
    const end = after.indexOf("extras:");
    const body = after.slice(0, end < 0 ? after.length : end);
    const workspace = body.slice(body.indexOf("workspace:"));
    found.push({
      tier: match[1],
      lines: [...workspace.matchAll(/"([^"]+)"/g)].map((line) => line[1]),
    });
  }
  return found;
}

/**
 * The phone's paywall, which is a third copy of the same numbers.
 *
 * Written as prose rather than bulleted lines -- "8 classes of up to 150
 * members, 250 activities, and 20 AI discovery searches with 5 cited deep
 * reports a day" -- so it needs its own patterns. Prose was left out of the
 * web rule above because the blurb there restates lines that are checked
 * beside it; here the prose is the whole card, so it is this or nothing.
 */
const PHONE_COUNTED: Array<{ phrase: RegExp; of: (tier: string) => number | undefined }> = [
  { phrase: /\b([\d,]+) activities\b/g, of: (tier) => capacity(tier)?.["study-activities"] },
  { phrase: /\b([\d,]+) goals\b/g, of: (tier) => capacity(tier)?.["learning-goals"] },
  { phrase: /\b([\d,]+) lists\b/g, of: (tier) => capacity(tier)?.["resource-lists"] },
  { phrase: /\b([\d,]+) canvases\b/g, of: (tier) => capacity(tier)?.canvases },
  { phrase: /\b([\d,]+) classes\b/g, of: (tier) => capacity(tier)?.["classes-owned"] },
  {
    // "8 classes of up to 150 members", "One class of 30", "5 classes of 100".
    phrase: /\bclass(?:es)? of (?:up to )?([\d,]+)/g,
    of: (tier) => capacity(tier)?.["class-members"],
  },
  {
    /*
     * Not "searches a day": the phone writes "20 AI discovery searches with
     * 5 cited deep reports a day", so the daily suffix belongs to the reports
     * and the search number has nothing after it. Requiring it checked the
     * search cap on no card at all -- measured by lowering the server's
     * teacher-plus rate and watching only the web copy complain.
     */
    phrase: /\b([\d,]+) (?:AI )?discovery searches\b/g,
    of: (tier) => rates(tier)?.searchPerDay,
  },
  {
    phrase: /\b([\d,]+) (?:cited )?deep reports a day\b/g,
    of: (tier) => rates(tier)?.deepPerDay,
  },
  {
    phrase: /\b([\d,]+) deep reports per 30 days\b/g,
    of: (tier) => rates(tier)?.deepPerMonth,
  },
];

/** The phone's plan names, as the tier each one sells. */
const PHONE_TIERS: Record<string, string> = {
  Free: "free",
  Plus: "plus",
  Pro: "pro",
  "Student Plus": "student-plus",
  "Student Pro": "student-pro",
  "Teacher Plus": "teacher-plus",
  "Teacher Pro": "teacher-pro",
};

/**
 * Each entry on the phone's paywall as its tier and its sentence.
 *
 * "Free" appears three times -- once per audience -- and each says something
 * different about the same tier, so all three are read.
 */
function phoneCards(): Array<{ tier: string; body: string }> {
  const source = readFileSync(phonePaywall, "utf8");
  const found: Array<{ tier: string; body: string }> = [];
  for (const match of source.matchAll(/title:\s*'([^']+)',\s*\n\s*body:\s*'((?:[^'\\]|\\.)*)'/g)) {
    const tier = PHONE_TIERS[match[1]];
    if (tier) found.push({ tier, body: match[2] });
  }
  return found;
}

describe("the price list", () => {
  it("reads as a list of cards with lines under each", () => {
    // A parse that returned nothing would make the comparison below pass by
    // having nothing to compare.
    const parsed = cards();
    expect(parsed.length).toBeGreaterThanOrEqual(6);
    expect(parsed.every((card) => card.lines.length >= 4)).toBe(true);
  });

  it("promises only what the server allows", () => {
    const wrong: string[] = [];
    for (const { tier, lines } of cards()) {
      for (const line of lines) {
        for (const { phrase, of } of COUNTED) {
          for (const match of line.matchAll(phrase)) {
            const said = Number(match[1].replace(/,/g, ""));
            const enforced = of(tier);
            if (enforced === undefined) {
              wrong.push(`${tier}: "${line}" counts something the server has no limit for`);
            } else if (said !== enforced) {
              wrong.push(`${tier}: "${line}" — the server allows ${enforced}`);
            }
          }
        }
      }
    }

    expect(
      wrong.sort(),
      "these lines on the plans page name a number the server does not " +
        "enforce; correct plan-copy.ts, or change the limit in entitlements.ts",
    ).toEqual([]);
  });

  it("says enough that is countable about every tier it sells", () => {
    /*
     * The other direction, and it needs a floor rather than a presence.
     *
     * "At least one countable line" was the first version of this and it was
     * useless: rewording all four workspace lines of Student Plus to
     * "Hundreds of study activities" left the two AI lines matching, so a
     * whole tier's capacity left the check and this still passed. Measured by
     * doing exactly that.
     *
     * Every card today lists four capacities and two or three AI rates, so
     * six is the floor -- one line may be reworded, four may not.
     */
    const thin = cards()
      .map(({ tier, lines }) => ({
        tier,
        checked: lines.reduce(
          (total, line) =>
            total +
            COUNTED.reduce(
              (n, { phrase }) => n + [...line.matchAll(new RegExp(phrase.source, "g"))].length,
              0,
            ),
          0,
        ),
      }))
      .filter(({ checked }) => checked < 6)
      .map(({ tier, checked }) => `${tier}: ${checked} number(s) this test can check`);

    expect(
      thin,
      "too few lines under these tiers name a number, so most of what they " +
        "promise is held to nothing",
    ).toEqual([]);
  });
});

describe("the phone's paywall", () => {
  it("reads as a card per plan", () => {
    const parsed = phoneCards();
    expect(parsed.length).toBeGreaterThanOrEqual(9);
    expect(new Set(parsed.map((card) => card.tier)).size).toBeGreaterThanOrEqual(7);
  });

  it("promises only what the server allows", () => {
    const wrong: string[] = [];
    for (const { tier, body } of phoneCards()) {
      for (const { phrase, of } of PHONE_COUNTED) {
        for (const match of body.matchAll(phrase)) {
          const said = Number(match[1].replace(/,/g, ""));
          const enforced = of(tier);
          if (enforced === undefined) {
            wrong.push(`${tier}: "${match[0]}" counts something the server has no limit for`);
          } else if (said !== enforced) {
            wrong.push(`${tier}: "${match[0]}" — the server allows ${enforced}`);
          }
        }
      }
    }

    expect(
      wrong.sort(),
      "these lines on the phone's paywall name a number the server does not " +
        "enforce; correct BENEFITS in artifacts/mobile/app/paywall.tsx, or " +
        "change the limit in entitlements.ts",
    ).toEqual([]);
  });

  it("says enough that is countable on every card", () => {
    /*
     * Three is the floor here rather than six: these are one-sentence cards
     * and the shortest names three numbers. The teacher's Free card is the
     * one that sets it -- thirty members and two of each AI kind -- because
     * "One class" is a word rather than a digit and nothing here reads it.
     * Every other card names four to seven.
     */
    const thin = phoneCards()
      .map(({ tier, body }) => ({
        tier,
        checked: PHONE_COUNTED.reduce(
          (n, { phrase }) => n + [...body.matchAll(new RegExp(phrase.source, "g"))].length,
          0,
        ),
      }))
      .filter(({ checked }) => checked < 3)
      .map(({ tier, checked }) => `${tier}: ${checked} number(s) this test can check`);

    expect(
      thin,
      "too little of these cards names a number, so most of what they " +
        "promise is held to nothing",
    ).toEqual([]);
  });
});

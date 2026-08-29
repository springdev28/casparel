/**
 * @fileOverview Verification role: exercises Paywall Promises What Is Given.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Every number on the paywall is a number the server actually allows.
 *
 * Both clients sell each plan in prose -- "400 activities, 150 goals, 75 lists
 * and 40 canvases, with 30 AI discovery searches and 8 cited deep reports a
 * day" -- and the server enforces the same allowances from two tables in
 * entitlements.ts. None of the three knows about the other two.
 *
 * The web's plan-copy.ts says so itself, at the top: "the client cannot import
 * server code, so this file is the hand-kept mirror, and a number changed
 * there must be changed here in the same commit." That is the right
 * instruction and there was nothing making it true.
 *
 * This is the one place in the product where a disagreement costs somebody
 * money. A paywall promising more than the server gives is a customer paying
 * for something they do not receive, and they discover it by being stopped
 * mid-task by a limit the screen they paid on said they would not hit. The
 * other direction is milder and still worth naming: a plan that quietly gives
 * more than it advertises is revenue left on the table and a number nobody
 * has kept up to date.
 *
 * It got harder to keep straight recently, which is the reason for writing
 * this down now: those nine descriptions were translated into five languages,
 * so each limit exists in six places on the client side. The digits survive
 * translation, so the translations are checked too -- a limit updated in
 * English and forgotten in Spanish is exactly the sort of thing nobody
 * notices until a Spanish-speaking customer quotes the Spanish number back.
 *
 * Read as text on both sides. The tables are TypeScript in another package
 * and the copy is prose; what matters is the number a person reads and the
 * number the server compares against.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AI_RATES_BY_TIER, CAPACITY_BY_TIER } from "./entitlements";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const paywall = readFileSync(
  resolve(repo, "artifacts/mobile/app/paywall.tsx"),
  "utf8",
);
const webCopy = readFileSync(
  resolve(repo, "artifacts/app/src/lib/plan-copy.ts"),
  "utf8",
);

/**
 * The plan name each block sells, and the copy that sells it.
 *
 * BENEFITS is keyed by audience -- student, teacher, generic -- and each entry
 * carries a title that is the plan name and a body that is the pitch.
 */
const SOLD = [...paywall.matchAll(/title:\s*'([^']+)',\s*\n\s*body:\s*`([^`]+)`,/g)].map(
  (match) => ({
    plan: match[1],
    copy: match[2],
    aiTier: /aiSummary\('([\w-]+)'\)/.exec(match[2])?.[1],
    where: "phone paywall",
  }),
);

/**
 * The web's cards, which carry their tier directly.
 *
 * Each card is a `tier:` followed by a blurb and two bullet lists, and every
 * string in all three is checked -- the bullets are where the detail is, and
 * the detail is what a buyer compares. Everything from one `tier:` to the next
 * belongs to that card.
 */
const WEB_CARDS = (() => {
  // The trailing cast is optional: one card is written `tier: "institutional"
  // as PlanTier`, and without allowing for it that card was never found --
  // so its lines were read as the previous card's, and this reported the Pro
  // plan as selling the Institutional plan's canvases.
  const starts = [...webCopy.matchAll(/\n\s*tier:\s*"([\w-]+)"(?:\s+as\s+\w+)?\s*,/g)];
  return starts.map((start, index) => ({
    tier: start[1] as keyof typeof CAPACITY_BY_TIER,
    copy: webCopy.slice(
      start.index,
      index + 1 < starts.length ? starts[index + 1].index : webCopy.length,
    ),
  }));
})();

/**
 * Which tier each plan name on the paywall is.
 *
 * "Free" appears three times, once per audience, and means the free tier every
 * time. The named ones map to their own row.
 */
const TIER_FOR_PLAN: Record<string, keyof typeof CAPACITY_BY_TIER> = {
  Free: "free",
  Plus: "plus",
  Pro: "pro",
};

/** The words the copy uses for each allowance, and where the limit lives. */
const CLAIMS: Array<{
  pattern: RegExp;
  /** null is the table's word for uncapped, which no plan here claims. */
  read: (tier: keyof typeof CAPACITY_BY_TIER) => number | null;
  what: string;
}> = [
  {
    pattern: /([\d,]+) activities/,
    read: (tier) => CAPACITY_BY_TIER[tier]["study-activities"],
    what: "study activities",
  },
  {
    pattern: /([\d,]+) goals/,
    read: (tier) => CAPACITY_BY_TIER[tier]["learning-goals"],
    what: "learning goals",
  },
  {
    pattern: /([\d,]+) lists/,
    read: (tier) => CAPACITY_BY_TIER[tier]["resource-lists"],
    what: "resource lists",
  },
  {
    pattern: /([\d,]+) canvases/,
    read: (tier) => CAPACITY_BY_TIER[tier].canvases,
    what: "canvases",
  },
  {
    // "8 classes of up to 150 members" and "One class of up to 30".
    pattern: /([\d,]+) classes of(?: up to)? ([\d,]+)/,
    read: (tier) => CAPACITY_BY_TIER[tier]["classes-owned"],
    what: "classes owned",
  },
  {
    pattern: /([\d,]+) (?:AI )?discovery searches/,
    read: (tier) => AI_RATES_BY_TIER[tier].searchPerDay,
    what: "AI searches a day",
  },
  {
    pattern: /([\d,]+) (?:cited )?deep reports a day/,
    read: (tier) => AI_RATES_BY_TIER[tier].deepPerDay,
    what: "deep reports a day",
  },
  {
    pattern: /([\d,]+) deep reports per 30 days/,
    read: (tier) => AI_RATES_BY_TIER[tier].deepPerMonth,
    what: "deep reports a month",
  },
];

const asNumber = (text: string) => Number(text.replace(/,/g, ""));

describe("what the paywall promises", () => {
  it("found the plans it sells", () => {
    // A renamed constant or a reshaped literal would leave nothing to compare,
    // and comparing nothing passes.
    expect(SOLD.length, "no plan copy found in paywall.tsx").toBeGreaterThanOrEqual(3);
  });

  it("names a tier this test knows for every plan it sells", () => {
    const unknown = SOLD.map((sold) => sold.plan).filter(
      (plan) => !(plan in TIER_FOR_PLAN),
    );
    expect(
      [...new Set(unknown)],
      "a plan is being sold that this file cannot map to a tier, so its " +
        "numbers are going unchecked",
    ).toEqual([]);
  });

  it("found the web's plan cards", () => {
    expect(WEB_CARDS.length, "no tier cards found in plan-copy.ts").toBeGreaterThanOrEqual(4);
  });

  it.each(
    WEB_CARDS.map((card, index) => [`${card.tier} #${index}`, card] as const),
  )("is what the server gives, on the web: %s", (_label, card) => {
    /*
     * Every number in the card, not the first of each kind. `matchAll`, not
     * `exec`: a card says "1,500 activities" in its blurb and "1,500 study
     * activities" in its bullets, and a check that stopped at the first would
     * have left the list a buyer actually reads unread.
     */
    let checked = 0;
    for (const claim of CLAIMS) {
      for (const found of card.copy.matchAll(new RegExp(claim.pattern, "g"))) {
        checked += 1;
        const allowed = claim.read(card.tier);
        expect(
          asNumber(found[1]),
          `plan-copy.ts sells ${card.tier} with "${found[0]}" and the server ` +
            `allows ${allowed} ${claim.what}`,
        ).toBe(allowed);
      }
    }
    expect(
      checked,
      `no allowance in the ${card.tier} card matched any pattern; the copy ` +
        `was reworded and this check went quiet`,
    ).toBeGreaterThan(0);
  });

  it.each(SOLD.map((sold, index) => [`${sold.plan} #${index}`, sold] as const))(
    "is what the server gives, on the phone: %s",
    (_label, sold) => {
      const tier = TIER_FOR_PLAN[sold.plan];
      const checked: string[] = [];
      expect(
        sold.aiTier,
        `${sold.plan} must generate its AI and storage promise from the canonical tier`,
      ).toBe(tier);
      checked.push("canonical AI and storage summary");
      for (const claim of CLAIMS) {
        const found = claim.pattern.exec(sold.copy);
        if (!found) continue;
        checked.push(claim.what);
        const allowed = claim.read(tier);
        // A finite promise against an uncapped table is not a mismatch, it is
        // a plan selling itself short -- and still a number that has stopped
        // being true.
        expect(
          asNumber(found[1]),
          allowed === null
            ? `the paywall sells ${sold.plan} with ${found[0]} and the server ` +
              `caps ${claim.what} on ${tier} at nothing at all`
            : `the paywall sells ${sold.plan} with ${found[0]} and the server ` +
              `allows ${allowed} ${claim.what} on ${tier}`,
        ).toBe(allowed);
      }
      // A block of prose that matched none of the patterns is a block this
      // test is not reading, which looks identical to a block that is correct.
      expect(
        checked.length,
        `no allowance in "${sold.copy.slice(0, 60)}…" matched any pattern; ` +
          `the copy was reworded and this check went quiet`,
      ).toBeGreaterThan(0);
    },
  );

  it("keeps the same numbers in every translation of that copy", () => {
    /*
     * Digits survive translation, so they are comparable across languages
     * without knowing a word of any of them. Everything else -- word order,
     * plurals, the shape of the sentence -- is free to differ, which is the
     * point of having translations at all.
     *
     * Which is why this compares the numbers as a set rather than a sequence.
     * Written as an ordered comparison first, it failed on Spanish for a good
     * reason: "2 informes profundos cada 30 días" puts the 30 where the
     * English puts the 2. That makes this check weaker than it looks -- it
     * would not notice a translation that attached the right numbers to the
     * wrong nouns -- and the alternative is asserting a word order no
     * translator should be held to. The failure it is really for is a limit
     * changed in English and left behind in five other files, and that shows
     * up as a different set.
     */
    /*
     * Whichever dictionaries are there, rather than a list written here.
     *
     * This named five, which was the set the day it was written; the product
     * later went to English and Turkish and this failed on a file that had
     * been deliberately deleted. A test that hardcodes the language list
     * fails for the language list changing, which is not what it is about --
     * it is about a price being edited in English and not in translation.
     */
    const dictionaryDir = resolve(repo, "artifacts/mobile/lib/i18n");
    const dictionaries = readdirSync(dictionaryDir)
      .filter((name) => /^[a-z]{2}\.ts$/.test(name))
      .map((name) => ({
        language: name.replace(/\.ts$/, ""),
        text: readFileSync(resolve(dictionaryDir, name), "utf8"),
      }));

    /*
     * A thousands separator is whatever the language uses.
     *
     * English writes 1,500; Spanish, German, Portuguese and Turkish write
     * 1.500; French writes 1 500 with a narrow no-break space. Read naively,
     * "1.500 actividades" is one and a half, and this reported a Spanish
     * translation as having changed a limit it had translated perfectly.
     *
     * The pattern is the actual grammar of a thousands separator -- one
     * separator followed by exactly three digits, repeating -- rather than
     * "any separator between digits". Written the permissive way it read
     * "One class of 30, 25 activities" as the single number 3025, because a
     * comma between two numbers in a list looks like a comma inside one.
     */
    const digitsIn = (text: string) =>
      (text.match(/\d+(?:[.,\u00a0\u202f]\d{3})*/g) ?? [])
        .map((value) => Number(value.replace(/[.,\u00a0\u202f]/g, "")))
        .sort((a, b) => a - b);

    for (const sold of SOLD) {
      const english = digitsIn(sold.copy);
      if (!english.length) continue;
      for (const { language, text } of dictionaries) {
        // The key is the English sentence; find its value.
        const escaped = sold.copy
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .replace(/'/g, "['’]");
        const entry = new RegExp(`"${escaped}":\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text);
        if (!entry) continue;
        expect(
          digitsIn(entry[1]),
          `${language} sells ${sold.plan} with different numbers than the ` +
            `English does; a limit was changed in one place and not the other`,
        ).toEqual(english);
      }
    }
  });
});

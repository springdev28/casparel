/**
 * @fileOverview Verification role: exercises Plan Copy.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The numbers we advertise must be the numbers we enforce.
 *
 * The same allowances are written down three times, by hand, in three places:
 * CAPACITY_BY_TIER / AI_RATES_BY_TIER here, the bullet lists in the web app's
 * plan-copy.ts, and prose in the Terms of Service. Nothing connected them, so
 * raising a limit in one place and not the others is a single careless edit -
 * and the failure is silent, because a bullet list renders perfectly whatever
 * it says.
 *
 * That failure is not cosmetic. A plans page promising more than the server
 * grants is a paid customer hitting a wall they were told they had bought past,
 * and a Terms page quoting the same figures makes it a written commitment. It
 * is also the kind of thing an app store reviewer checks: the purchase screen
 * has to describe what the purchase actually does.
 *
 * So this reads the app's own copy and holds it against the enforced tables.
 * It parses the bullets rather than importing them because the two live in
 * different packages; a bullet that stops matching its pattern fails loudly
 * here rather than being skipped.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AI_RATES_BY_TIER,
  CAPACITY_BY_TIER,
  type SubscriptionTier,
} from "./entitlements";

const PLAN_COPY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../app/src/lib/plan-copy.ts",
);
const copy = readFileSync(PLAN_COPY, "utf8");

/** "25 study activities" -> 25, matched against the enforced capacity key. */
const WORKSPACE_PATTERNS: [RegExp, keyof (typeof CAPACITY_BY_TIER)["free"]][] = [
  [/^([\d,]+) study activit/i, "study-activities"],
  [/^([\d,]+) learning goal/i, "learning-goals"],
  [/^([\d,]+) resource list/i, "resource-lists"],
  [/^([\d,]+) canvas/i, "canvases"],
];

function number(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

/**
 * Pull one tier's card out of the source. Deliberately literal: the point is to
 * read what a reader of the file sees, not to re-derive it.
 */
function cardFor(tier: string): string {
  const marker = `tier: "${tier}"`;
  const start = copy.indexOf(marker);
  expect(start, `no card for tier "${tier}" in plan-copy.ts`).toBeGreaterThan(-1);
  const end = copy.indexOf("      extras: [", start);
  expect(end, `card for "${tier}" has no extras block`).toBeGreaterThan(start);
  return copy.slice(start, end);
}

function bullets(card: string, field: "workspace" | "ai"): string[] {
  const start = card.indexOf(`${field}: [`);
  if (start === -1) return [];
  const end = card.indexOf("]", start);
  return [...card.slice(start, end).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Every tier the app advertises, mapped to the tier the server enforces. */
const ADVERTISED: SubscriptionTier[] = [
  "free",
  "plus",
  "pro",
];

describe("advertised plan limits match the enforced ones", () => {
  it.each(ADVERTISED)("workspace allowances on the %s card", (tier) => {
    const card = cardFor(tier);
    const enforced = CAPACITY_BY_TIER[tier];
    let matched = 0;

    for (const bullet of bullets(card, "workspace")) {
      for (const [pattern, key] of WORKSPACE_PATTERNS) {
        const found = bullet.match(pattern);
        if (!found) continue;
        matched += 1;
        expect(
          enforced[key],
          `the ${tier} card advertises a number for ${key} but the server leaves it uncapped`,
        ).not.toBeNull();
        expect(
          number(found[1]),
          `"${bullet}" on the ${tier} card, but the server allows ${enforced[key]}`,
        ).toBe(enforced[key]);
      }
    }

    // A card whose bullets stopped matching would otherwise pass by checking
    // nothing at all, which is the failure mode this whole file exists to stop.
    expect(matched, `no workspace bullet on the ${tier} card was recognised`)
      .toBeGreaterThan(0);
  });

  it.each(ADVERTISED)("AI allowances on the %s card", (tier) => {
    const card = cardFor(tier);
    // AI copy is generated from the canonical catalog. Guard that each card
    // asks for its own tier rather than silently displaying a sibling's pool.
    expect(card).toContain(`ai: aiLines("${tier}")`);
    expect(AI_RATES_BY_TIER[tier].searchPerMonth).toBeGreaterThan(0);
    expect(AI_RATES_BY_TIER[tier].deepPerMonth).toBeGreaterThan(0);
  });
});

describe("the Terms of Service quote the Free tier correctly", () => {
  const TERMS = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/src/pages/LegalPage.tsx",
  );
  const terms = readFileSync(TERMS, "utf8").replace(/\s+/g, " ");
  const free = CAPACITY_BY_TIER.free;
  const freeAi = AI_RATES_BY_TIER.free;

  // Spelled out, because that is how the prose reads. Anything above ten in
  // these tables is written as a numeral.
  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const spelled = (n: number | null) => (n === null ? "unlimited" : (WORDS[n] ?? String(n)));

  // null means uncapped, which the tables reserve for admin accounts. A sold
  // tier holding one would contradict the Terms directly ("Every allowance on
  // every plan ... is finite"), so that is asserted rather than coerced away.
  const FREE_ALLOWANCES: Array<{ label: string; value: number | null }> = [
    { label: "class members", value: free["class-members"] },
    { label: "study activities", value: free["study-activities"] },
    { label: "learning goals", value: free["learning-goals"] },
    { label: "resource lists", value: free["resource-lists"] },
    { label: "canvases", value: free.canvases },
  ];

  it.each(FREE_ALLOWANCES)("states the Free $label allowance", ({ label, value }) => {
    const numeral = new RegExp(`\\b${value}\\b`);
    const word = new RegExp(`\\b${spelled(value)}\\b`, "i");
    expect(
      numeral.test(terms) || word.test(terms),
      `the Terms never mention the Free ${label} allowance of ${value}`,
    ).toBe(true);
  });

  it("states the Free AI allowances", () => {
    expect(
      new RegExp(`\\b(${freeAi.searchPerDay}|${spelled(freeAi.searchPerDay)})\\b.{0,40}search`, "i").test(terms),
      `the Terms do not state ${freeAi.searchPerDay} discovery searches a day`,
    ).toBe(true);
    expect(
      new RegExp(`\\b(${freeAi.deepPerMonth}|${spelled(freeAi.deepPerMonth)})\\b.{0,60}(deep research|30 days)`, "i").test(terms),
      `the Terms do not state ${freeAi.deepPerMonth} deep research reports per 30 days`,
    ).toBe(true);
  });
});

/**
 * Free's deep research is two reports per rolling thirty days, not two a day.
 *
 * Four places said "a small daily taste of AI" -- the plans page, the sidebar,
 * the landing page and the phone's plan card -- which is right about discovery
 * search and wrong about deep research by a factor of thirty. The number was
 * never quoted, so the arithmetic checks above had nothing to catch, and a
 * marketing adjective is exactly the sort of thing that survives a review of
 * the figures.
 *
 * The rule is narrow on purpose: copy may call the AI allowance daily only if
 * every part of it is. It stops being enforced the moment the rates make it
 * true, which is the right condition -- if Free ever gets a daily deep report,
 * "daily" becomes accurate and this stops asking.
 */
describe("what the copy calls Free's AI allowance", () => {
  const freeIsDailyThroughout = AI_RATES_BY_TIER.free.deepPerMonth > AI_RATES_BY_TIER.free.deepPerDay;

  const SURFACES = [
    "../../../app/src/lib/plan-copy.ts",
    "../../../app/src/components/PlanSection.tsx",
    "../../../app/src/components/AppShell.tsx",
    "../../../app/src/pages/LandingPage.tsx",
    // PremiumCard was here until the unreachable native screens went; the
    // paywall is the one plan surface the phone still draws itself.
    "../../../mobile/app/paywall.tsx",
  ];

  it.skipIf(freeIsDailyThroughout).each(SURFACES)("does not call it daily in %s", (file) => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), file),
      "utf8",
    );
    const offenders = source
      .split("\n")
      .map((line, index) => [index + 1, line] as const)
      // Only the word "taste", which is how the Free tier's AI is described
      // everywhere. "AI allowances reset daily" is shown to paid accounts, and
      // for those the daily window really is the binding one, so it stays.
      .filter(([, line]) => !/^\s*(\*|\/\/)/.test(line))
      .filter(([, line]) => /daily[^"'`]{0,20}taste|taste[^"'`]{0,20}daily/i.test(line))
      .map(([number, line]) => `${number}: ${line.trim()}`);

    expect(
      offenders,
      `Free gets ${AI_RATES_BY_TIER.free.deepPerMonth} deep reports per 30 days, not per day`,
    ).toEqual([]);
  });
});

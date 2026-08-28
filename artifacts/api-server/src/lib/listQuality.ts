/**
 * @fileOverview Backend domain role: centralizes List Quality logic so route handlers share one implementation and invariant.
 * System connection: imported by API routes and, where applicable, tested independently from HTTP transport.
 */
import { canonicalResourceUrl, sourceFamily } from "@workspace/resource-identity";

/**
 * What can honestly be said about a Learning List from the list itself.
 *
 * The workflow specification asks the list builder to "inspect quality" and
 * names six things to look for: gaps, duplication, prerequisites, level
 * mismatch, provider concentration, and explanation/practice balance.
 *
 * Three of those are answerable from the rows and three are not. Duplication,
 * provider concentration and level mismatch are arithmetic over data the app
 * already holds. Gaps and prerequisites are claims about a subject -- what a
 * learner needs before this, what this list is missing -- and nothing here
 * knows them; a plausible sentence about them would be invention dressed as
 * advice, on the screen where somebody decides what to study next.
 * Explanation/practice balance was the same problem until the learner could
 * answer it: a format is not a role, and the catalogue does not record whether
 * something asks the reader to do anything. It does now, for the items
 * somebody has labelled, and only for those -- a list with no roles on it is
 * not a list with nothing to practise on, it is a list nobody has said
 * anything about, and the two must not read the same.
 *
 * So this returns facts, each with the numbers behind it, and the list of
 * checks it made. The screens phrase them; that is also what keeps the
 * findings translatable, since a sentence built here could only ever be in one
 * language.
 */

export type ListQualityItem = {
  resourceId: number;
  title: string;
  url: string;
  format: string;
  gradeLevel: string;
  /** What the learner said this is doing here, when they said anything. */
  role?: string | null;
};

export type ListQualityFinding =
  | { kind: "one_provider"; provider: string; count: number }
  | { kind: "one_format"; format: string; count: number }
  | { kind: "duplicate_link"; resourceIds: number[] }
  | {
      kind: "level_mismatch";
      resourceIds: number[];
      level: string;
      majority: string;
    }
  | { kind: "no_practice"; count: number };

/** The checks this makes, named so a screen can say what was looked at. */
export const LIST_QUALITY_CHECKS = [
  "one_provider",
  "one_format",
  "duplicate_link",
  "level_mismatch",
  "no_practice",
] as const;

/**
 * Below this a list is too short for any of it to mean anything: two articles
 * from one site is a coincidence, not a concentration.
 */
const ENOUGH_TO_JUDGE = 3;

/** Where "several from one place" becomes "almost all from one place". */
const CONCENTRATED = 0.7;

export function reviewList(items: ListQualityItem[]): {
  itemCount: number;
  findings: ListQualityFinding[];
  checked: string[];
} {
  const findings: ListQualityFinding[] = [];

  // ── the same link twice ───────────────────────────────────────────────────
  //
  // Certain rather than probable: the same address written two ways is one
  // page, whatever the two rows are called. Near-duplicates -- the same work
  // under different titles -- are deliberately not reported, because being
  // wrong about that means telling somebody to remove something they meant.
  const byUrl = new Map<string, number[]>();
  for (const item of items) {
    const key = canonicalResourceUrl(item.url);
    const existing = byUrl.get(key);
    if (existing) existing.push(item.resourceId);
    else byUrl.set(key, [item.resourceId]);
  }
  for (const resourceIds of byUrl.values()) {
    if (resourceIds.length > 1) findings.push({ kind: "duplicate_link", resourceIds });
  }

  if (items.length >= ENOUGH_TO_JUDGE) {
    // ── almost everything from one site ─────────────────────────────────────
    const providers = tally(items.map((item) => sourceFamily(item.url)).filter(Boolean));
    const [topProvider, providerCount] = commonest(providers);
    if (topProvider && providerCount / items.length >= CONCENTRATED) {
      findings.push({
        kind: "one_provider",
        provider: topProvider,
        count: providerCount,
      });
    }

    // ── everything in one form ──────────────────────────────────────────────
    const formats = tally(items.map((item) => item.format));
    const [topFormat, formatCount] = commonest(formats);
    if (topFormat && formatCount === items.length) {
      findings.push({ kind: "one_format", format: topFormat, count: formatCount });
    }

    // ── one or two aimed somewhere else ─────────────────────────────────────
    //
    // Only when there is a majority to be the odd one out of. A list evenly
    // split between two levels is a choice, not a mistake, and saying
    // otherwise would be noise on every list built across a transition.
    // ── labelled, and none of it to practise on ─────────────────────────────
    //
    // Only about the items the learner labelled. An unlabelled list says
    // nothing about practice, and reporting it as having none would be a
    // conclusion drawn from silence.
    const labelled = items.filter((item) => item.role);
    if (
      labelled.length >= ENOUGH_TO_JUDGE &&
      !labelled.some((item) => item.role === "practice")
    ) {
      findings.push({ kind: "no_practice", count: labelled.length });
    }

    const levels = tally(items.map((item) => item.gradeLevel).filter(Boolean));
    const [majority, majorityCount] = commonest(levels);
    if (majority && majorityCount > items.length / 2 && majorityCount < items.length) {
      const odd = items.filter(
        (item) => item.gradeLevel && item.gradeLevel !== majority,
      );
      // Report one level at a time, so the screen can name it.
      const oddLevels = tally(odd.map((item) => item.gradeLevel));
      for (const [level] of oddLevels) {
        findings.push({
          kind: "level_mismatch",
          resourceIds: odd
            .filter((item) => item.gradeLevel === level)
            .map((item) => item.resourceId),
          level,
          majority,
        });
      }
    }
  }

  return {
    itemCount: items.length,
    findings,
    checked: [...LIST_QUALITY_CHECKS],
  };
}

function tally(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

/** The most common value and how often it appears; ties go to the first seen. */
function commonest(counts: Map<string, number>): [string | null, number] {
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return [best, bestCount];
}

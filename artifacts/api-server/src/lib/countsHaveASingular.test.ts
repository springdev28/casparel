/**
 * @fileOverview Verification role: exercises Counts Have A Singular.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * A count and its noun agree, in English, when the count is one.
 *
 * `{list.itemCount} items` reads "1 items" to everybody with one item, and
 * one item is the state a new account is in. It is invisible to every check
 * this repository has: the string is grammatical to a parser, it is
 * translated -- Turkish does not inflect the noun after a number, so the
 * dictionary is right and English is the broken half -- and it fits its box.
 *
 * Four were found on the phone this way and five here, by rendering a screen
 * with exactly one of something on it. This is the cheaper half of that:
 * `counted(n, singular, plural)` exists for the shape, and anything written
 * without it in JSX is a plural that cannot become singular.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const web = join(repository, "artifacts/app/src");

/**
 * Plurals that stay plural whatever the number, with the reason.
 *
 * Kept short. Each row is a claim that "1 <word>" can never be rendered,
 * either because the count cannot be one or because the phrase is a ratio.
 */
const ALWAYS_PLURAL: Record<string, string> = {
  "components/ContinueWorkflows.tsx:steps":
    "a ratio -- `2/5 steps` -- where the noun belongs to the second number",
  "components/SeatingChartEditor.tsx:elements":
    "drawn only inside `selectedElementIds.length > 1`, so one is never shown",
  "pages/ResourceDetailPage.tsx:fields":
    "`1 of 8 fields are unknown` -- the noun belongs to the total, not the count",
  "pages/ActivitiesPage.tsx:cards":
    "the import throws above this on fewer than two rows, so one is never " +
    "imported and never reported",
  "pages/ActivitiesPage.tsx:choices":
    "a quiz card always has at least two, which the editor enforces",
};

function everyTsxFile(): string[] {
  const found: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(join(web, dir), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), `${prefix}${entry.name}/`);
        continue;
      }
      if (entry.name.endsWith(".tsx")) found.push(`${prefix}${entry.name}`);
    }
  };
  walk(".", "");
  return found.sort();
}

describe("a count and its noun", () => {
  it("found the files to read", () => {
    expect(everyTsxFile().length).toBeGreaterThanOrEqual(20);
  });

  it("agree when the count is one", () => {
    const wrong: string[] = [];
    for (const file of everyTsxFile()) {
      const lines = readFileSync(join(web, file), "utf8").split("\n");
      lines.forEach((line, index) => {
        // A line that already chooses, or hands the choice to `counted`, is
        // doing the right thing however it is written.
        if (/===\s*1\s*\?|counted\(/.test(line)) return;
        for (const match of line.matchAll(
          /\{[^{}]*?(?:count|Count|length|total|Total)[^{}]*?\}\s+([a-z]{3,})s\b/g,
        )) {
          const key = `${file}:${match[1]}s`;
          if (key in ALWAYS_PLURAL) continue;
          wrong.push(`${file}:${index + 1}  "${match[1]}s" has no singular`);
        }
      });
    }

    expect(
      wrong.sort(),
      "these render a count and a plural noun with no singular, so each reads " +
        '"1 <plural>" to somebody with one; use counted(n, singular, plural), ' +
        "or name it in ALWAYS_PLURAL with the reason one can never be shown",
    ).toEqual([]);
  });

  it("has no exemption for a phrase that is no longer written", () => {
    // A stale row is a standing excuse for a shape nobody writes any more,
    // and the next real one hides behind it.
    const text = everyTsxFile()
      .map((file) => [file, readFileSync(join(web, file), "utf8")] as const);
    const stale = Object.keys(ALWAYS_PLURAL).filter((key) => {
      const [file, word] = [key.slice(0, key.lastIndexOf(":")), key.slice(key.lastIndexOf(":") + 1)];
      const source = text.find(([name]) => name === file)?.[1];
      return !source || !source.includes(` ${word}`);
    });
    expect(stale, "these name a file or a word that is not there any more").toEqual([]);
  });
});

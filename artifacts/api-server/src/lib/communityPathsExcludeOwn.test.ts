/**
 * The community grid may not show you your own shared paths.
 *
 * `GET /learning-goal-templates` returns every shared path, your own
 * included, and the goals page rendered the whole list. So the first account
 * to use the feature -- which, for a new install, is every account -- shared
 * its goals and then saw them again below, under "Community study paths /
 * Reuse checklists shared by students and teachers", credited to itself, each
 * with a button offering to add a copy. The button works: it creates a second
 * identical goal in the same account, and bumps the "Used N times" counter on
 * your own path.
 *
 * The list itself still has to contain your paths, because the share button's
 * label is derived from it -- "Share path" or "Update shared path" is the only
 * confirmation anywhere that a share landed. So the filter belongs at the
 * grid, and this checks it is still there: that the grid renders the filtered
 * list and the button still reads the full one.
 *
 * Read as text on purpose, like the other guards here: what matters is what a
 * reader of the file sees, and there is no DOM in this suite to render into.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appSrc = resolve(dirname(fileURLToPath(import.meta.url)), "../../../app/src");
const goalsPage = readFileSync(resolve(appSrc, "pages/GoalsPage.tsx"), "utf8");

const dictionaryDir = resolve(appSrc, "lib/ui-translations");
const languages = readdirSync(dictionaryDir)
  .filter((name) => name.endsWith(".ts") && name !== "index.ts")
  .map((name) => ({
    language: name.replace(/\.ts$/, ""),
    text: readFileSync(resolve(dictionaryDir, name), "utf8"),
  }));

describe("community study paths", () => {
  it("reads the file it is about", () => {
    // A renamed page would make every assertion below vacuous.
    expect(goalsPage).toContain("Community study paths");
  });

  it("derives the grid from a list with your own paths removed", () => {
    expect(goalsPage).toMatch(
      /const sharedByOthers = communityPaths\.filter\(\s*\(path\) => path\.creatorId !== me\?\.id,?\s*\)/,
    );
  });

  it("renders that list, not the raw one", () => {
    expect(
      goalsPage,
      "the grid must map over sharedByOthers, or your own paths come back",
    ).toContain("sharedByOthers.slice(0, 9).map");
    expect(goalsPage).not.toContain("communityPaths.slice(0, 9).map");
  });

  it("still asks the full list whether you have shared this goal", () => {
    // Filtering the fetch instead of the grid would silently break the share
    // button's label, which is the only feedback a share ever gives.
    expect(goalsPage).toMatch(
      /communityPaths\.some\(\s*\(path\) =>\s*path\.creatorId === me\?\.id &&\s*path\.sourceGoalId === goal\.id,?\s*\)/,
    );
  });

  it("says something true when nobody else has shared anything", () => {
    for (const sentence of [
      "Nothing shared by other people yet",
      "Your path is in the library. Paths other people share will appear here.",
    ]) {
      expect(goalsPage).toContain(sentence);
      for (const { language, text } of languages)
        expect(
          text.includes(JSON.stringify(sentence)),
          `${language} has no translation for ${JSON.stringify(sentence)}`,
        ).toBe(true);
    }
  });
});

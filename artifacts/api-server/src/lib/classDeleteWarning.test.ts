/**
 * A destructive dialog has to name what it destroys.
 *
 * Deleting a class said it removed "the class, its memberships, and its class
 * resource list". Verified against a real database, it also removes the whole
 * class discussion -- every post and comment, including ones written by
 * students, which are the contributions a teacher is least entitled to lose on
 * someone else's behalf -- and the class's assignments. None of that was
 * mentioned.
 *
 * It also under-sold the good news. Activities and canvases shared with a class
 * are no longer destroyed with it; they go back to whoever made them. A teacher
 * hesitating over the button deserves to know that too, or they will keep a
 * dead class around to protect work that was never at risk.
 *
 * Facts asserted here were each checked against a running server:
 *   • a pupil's class forum post is gone after the delete,
 *   • a class assignment is gone,
 *   • a pupil's shared activity survives and returns to their own library.
 *
 * The wording is one whole sentence group on purpose. UiTranslationBridge
 * matches exact strings, so splitting it or interpolating any part of it would
 * silently leave five languages reading the English.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appSrc = resolve(dirname(fileURLToPath(import.meta.url)), "../../../app/src");
const page = readFileSync(resolve(appSrc, "pages/ClassDetailPage.tsx"), "utf8");

const dictionaryDir = resolve(appSrc, "lib/ui-translations");
const languages = readdirSync(dictionaryDir)
  .filter((name) => name.endsWith(".ts") && name !== "index.ts")
  .map((name) => ({
    language: name.replace(/\.ts$/, ""),
    text: readFileSync(resolve(dictionaryDir, name), "utf8"),
  }));

/** As the reader sees it: JSX entities resolved back to characters. */
const warning = (() => {
  const start = page.indexOf("Deletes the class");
  expect(start, "the class-delete warning is gone from the page").toBeGreaterThan(-1);
  return page.slice(start, page.indexOf("</DialogDescription>", start)).replace(/&apos;/g, "'");
})();

describe("deleting a class says what it will take", () => {
  it("warns that the discussion goes too", () => {
    // The surprising loss, and the one that belongs to other people.
    expect(warning).toMatch(/discussion/i);
    expect(warning).toMatch(/students/i);
  });

  it("warns about the assignments", () => {
    expect(warning).toMatch(/assignments/i);
  });

  it("says what survives, so nobody keeps a dead class to protect it", () => {
    expect(warning).toMatch(/activities and canvases/i);
    expect(warning).toMatch(/kept|go back/i);
  });

  it("says it cannot be undone", () => {
    expect(warning).toMatch(/cannot be undone/i);
  });

  it("no longer claims the class list is all that goes", () => {
    expect(page).not.toContain("This permanently deletes the class, its memberships");
  });

  it.each(languages.map((l) => [l.language, l.text]))(
    "is translated into %s",
    (_language, text) => {
      expect(
        text.includes(`"${warning.replace(/"/g, '\\"')}":`),
        `the warning is untranslated, so those readers get the old wording or none`,
      ).toBe(true);
    },
  );
});

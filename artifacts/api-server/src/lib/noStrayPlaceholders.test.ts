/**
 * @fileOverview Verification role: exercises No Stray Placeholders.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * No screen may render a lone punctuation mark as its content.
 *
 * The schedule's empty-day cell contained the text ", " -- just a comma. An
 * untouched week rendered seven of them in a row under the day names, which
 * read as a broken grid rather than an empty one, on a page every new account
 * opens with nothing in it.
 *
 * It is the residue of an edit: something was replaced and the punctuation
 * that surrounded it was left behind. That is easy to do and impossible to
 * notice in a diff, because a comma on its own line looks like formatting.
 * Nothing else catches it either -- it type-checks, it renders, and a
 * screenshot of a nearly-empty grid looks plausibly like an empty grid.
 *
 * So the shape is banned outright. A JSX element whose entire content is
 * punctuation is either a mistake or something that should be an empty state
 * with words in it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appSrc = resolve(dirname(fileURLToPath(import.meta.url)), "../../../app/src");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

/**
 * A line that is nothing but punctuation, sitting between JSX tags.
 *
 * Deliberately narrow. Punctuation *attached* to text is ordinary prose, and
 * an expression such as {", "} inside a join is deliberate; what is banned is
 * a bare mark standing alone as an element's visible content.
 */
const LONE_PUNCTUATION = /^[\s]*[,;:.•\-]+[\s]*$/;

function offences(): string[] {
  const found: string[] = [];
  for (const file of tsxFiles(appSrc)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!LONE_PUNCTUATION.test(line) || line.trim() === "") return;
      /**
       * The nearest real line above, stepping over comments and blanks.
       *
       * Without this the guard is defeated by a comment. The fix for the
       * original defect put an explanatory {/* … *␟/} between the opening tag
       * and the content, and a comma restored underneath it stopped being
       * detected -- so the one place known to have had this bug was the one
       * place protected from noticing it again.
       */
      let above = index - 1;
      for (;;) {
        const line = lines[above];
        if (above < 0 || line === undefined) break;
        if (line.trim() === "" || line.trim().startsWith("//")) {
          above -= 1;
          continue;
        }
        // A block comment ends here: step over the whole of it, however it is
        // written inside. Its body lines are ordinary prose, so matching them
        // one at a time does not work.
        if (/\*\/\}?\s*$/.test(line)) {
          above -= 1;
          while (above >= 0 && !/\{?\/\*/.test(lines[above] ?? "")) above -= 1;
          above -= 1;
          continue;
        }
        break;
      }
      const before = lines[above]?.trimEnd() ?? "";
      const after = lines[index + 1]?.trimStart() ?? "";
      /**
       * Only when the mark is the whole of an element's content: an element
       * *opens* on the line above and closes on the line below.
       *
       * The opening part matters. A full stop after a link --
       * `</Link>` then `.` then `</p>` -- is a sentence ending, which is
       * ordinary prose and appears on five pages here. What is wrong is a mark
       * alone inside an element that was meant to hold something.
       */
      const opensAbove = before.endsWith(">") && !/<\/[^<]*$/.test(before);
      if (opensAbove && after.startsWith("</")) {
        found.push(
          `${file.slice(appSrc.length + 1)}:${index + 1} renders ${JSON.stringify(line.trim())} on its own`,
        );
      }
    });
  }
  return found;
}

describe("no screen shows a stray punctuation mark", () => {
  it("finds files to check", () => {
    // A moved directory would make the assertion below vacuous.
    expect(tsxFiles(appSrc).length).toBeGreaterThan(20);
  });

  it("has none", () => {
    expect(
      offences(),
      "an element whose only content is punctuation is either leftover from an " +
        "edit or an empty state that needs words",
    ).toEqual([]);
  });
});

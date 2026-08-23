/**
 * @fileOverview Verification role: exercises Dark Variants Cannot Match.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The web app has no `.dark` class, so a `dark:` utility is a class that can
 * never match.
 *
 * Casparel's dark mode is not a class on <html>. ThemeCustomizer writes the
 * palette onto :root as inline custom properties -- `--background`, `--card`,
 * `--foreground` and the rest -- and every colour in the design system is
 * `hsl(var(--…))`, so the whole interface follows without a variant anywhere.
 *
 * The design system still declares `@custom-variant dark (&:is(.dark *))`,
 * because it is a general-purpose package and a different consumer may well
 * theme by class. Inside this app that selector has nothing to match: nothing
 * in the product ever adds `.dark` to anything.
 *
 * Which makes `text-emerald-600 dark:text-emerald-400` a sentence that reads
 * as covering both themes and covers one. The light shade is what a reader on
 * a dark background actually got, and there were 31 of these -- status text,
 * warning icons, the tint behind "Student recommendations" -- each of them the
 * half of a pair chosen for the wrong surface.
 *
 * The replacement is a token: --success-text, --warning-text, --info-text and
 * the --destructive-text that already existed, each picked for contrast
 * against the palette in use. That is how every other colour in this product
 * works, and it needs no variant.
 *
 * A class that cannot match is invisible to everything else. It type-checks,
 * it renders, and the render audit only catches it where the wrong shade
 * happens to cross a contrast threshold on a page some fixture reaches. So it
 * is held here instead. If this app ever grows a real `.dark` toggle, delete
 * this file in the same change that adds it -- the second test below is the
 * reminder.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appSrc = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../app/src",
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/**
 * `dark:` in a className, not in prose.
 *
 * Comments discuss the variant -- this rule has to be explained where somebody
 * would otherwise reach for it -- so comments are blanked first, and what is
 * left has to look like a class: preceded by a quote, backtick, brace or
 * space, and followed by a utility rather than by a space.
 */
const DARK_VARIANT = /(?<=["'`{ ])dark:[a-z0-9[\]/.:_-]+/g;

/** Blank out comments, keeping the length so offsets still name a line. */
function withoutComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(
      /(^|[^:])\/\/[^\n]*/g,
      (line, before: string) => before + " ".repeat(line.length - before.length),
    );
}

describe("dark: utilities in the web app", () => {
  it("do not exist, because nothing in this app adds a .dark class", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(appSrc)) {
      const source = withoutComments(readFileSync(file, "utf8"));
      for (const match of source.matchAll(DARK_VARIANT)) {
        const line = source.slice(0, match.index).split("\n").length;
        offenders.push(`${file.slice(appSrc.length + 1)}:${line} ${match[0]}`);
      }
    }
    expect(
      offenders,
      "These classes can never match: this app themes by writing custom " +
        "properties onto :root, not by adding `.dark`, so the *other* half of " +
        "each pair is what a reader on a dark palette sees. Use a token that " +
        "follows the palette -- text-success-text, text-warning-text, " +
        "text-info-text, text-destructive-text -- or a translucent tint like " +
        "bg-success-text/10, which works on either polarity.",
    ).toEqual([]);
  });

  it("is not a rule the app has quietly outgrown", () => {
    const adds = sourceFiles(appSrc).filter((file) =>
      /classList\.(add|toggle)\(\s*["'`]dark["'`]/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(
      adds,
      "Something now adds a `.dark` class, which means `dark:` variants work " +
        "and the test above is obsolete. Delete this file in the same change.",
    ).toEqual([]);
  });
});

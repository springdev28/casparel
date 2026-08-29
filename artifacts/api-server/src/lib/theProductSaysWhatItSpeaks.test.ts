/**
 * @fileOverview Verification role: exercises The Product Says What It Speaks.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The product does not name a language it does not speak.
 *
 * The guide told readers "The interface ships in English, Spanish, French,
 * German, Portuguese, and Turkish" and headed a section "Six languages". It
 * ships in two. Somebody choosing Casparel because it speaks Spanish finds
 * that it does not, after signing up -- which is the worst moment to find out
 * and the reason this is a defect rather than stale copy.
 *
 * Nothing could have noticed. Every audit renders the guide, and a sentence
 * that is grammatical, translated and fits its box passes all of them; the
 * only thing wrong with it is that it is untrue. The claim and the language
 * list live in different files and neither refers to the other.
 *
 * So this reads the list the app actually offers and refuses any user-facing
 * sentence that names a language outside it. A language may still be
 * mentioned honestly -- the catalogue names the language a *source* is
 * written in, which is a wider set than the interface's -- so the rule is
 * scoped to the pages that describe the product to a reader.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const web = join(repository, "artifacts/app/src");

/**
 * The pages that describe the product to somebody deciding whether to use it.
 *
 * A claim about what Casparel speaks belongs to these; elsewhere a language
 * name is usually about a resource rather than the interface.
 */
const SALES_COPY = [
  "pages/GuidePage.tsx",
  "pages/LandingPage.tsx",
  "pages/TutorialPage.tsx",
  "pages/PlansPage.tsx",
  "pages/SupportPage.tsx",
];

/** Every language name that could be claimed, so an absent one is noticed. */
const NAMES: Record<string, string[]> = {
  en: ["English"],
  tr: ["Turkish", "Türkçe"],
  es: ["Spanish", "Español"],
  fr: ["French", "Français"],
  de: ["German", "Deutsch"],
  pt: ["Portuguese", "Português"],
  it: ["Italian", "Italiano"],
  nl: ["Dutch", "Nederlands"],
};

/** The codes the sign-in screen and Settings actually offer. */
function languagesOffered(): string[] {
  const source = readFileSync(join(web, "lib/auth-locale.ts"), "utf8");
  const at = source.indexOf("export const AUTH_LANGUAGES = [");
  const list = source.slice(at, source.indexOf("] as const", at));
  return [...list.matchAll(/code:\s*"([a-z-]+)"/g)].map((match) => match[1]);
}

/**
 * The sentences a reader sees on a page, with comments removed.
 *
 * Sentences rather than every literal, and that distinction is the rule.
 * `es: "Spanish"` on the landing page is a lookup table for naming the
 * language a *catalogue source* is written in, which is a wider set than the
 * interface's and is not a claim about anything. "Use Casparel in English,
 * Spanish, ..." is a claim. Four words is what separates them.
 *
 * Comments are stripped because one of them explains this very bug by
 * quoting the six names, and a rule that read it would fail on its own
 * explanation.
 */
function sentencesIn(
  file: string,
  minimumWords = 4,
): Array<{ text: string; line: number }> {
  const source = readFileSync(join(web, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  const found: Array<{ text: string; line: number }> = [];
  /*
   * Line by line, not across the file.
   *
   * Pairing quotes over a whole file desynchronises on the first apostrophe
   * in JSX text -- one `'` opens a run that swallows everything to the next
   * one, and the sentence this rule was written for went missing from a scan
   * that found 229 others. Measured: the file-wide pass matched no sentence
   * containing "Spanish" while the file plainly contained one.
   */
  source.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(/(['"])((?:(?!\1)[^\\]|\\.){12,400})\1/g)) {
      const text = match[2];
      if (text.trim().split(/\s+/).length < minimumWords) return;
      found.push({ text, line: index + 1 });
    }
  });
  return found;
}

/** How the product spells a count of languages in its own copy. */
const COUNT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

describe("what the product says it speaks", () => {
  it("found the list of languages the app offers", () => {
    // A parse that silently returned nothing would make every check below
    // pass by having no names to forbid.
    expect(languagesOffered()).toContain("en");
    expect(languagesOffered().length).toBeGreaterThanOrEqual(2);
  });

  it("names no language the interface does not have", () => {
    const offered = new Set(languagesOffered());
    const forbidden = Object.entries(NAMES)
      .filter(([code]) => !offered.has(code))
      .flatMap(([, names]) => names);

    const claims: string[] = [];
    for (const file of SALES_COPY) {
      let sentences: Array<{ text: string; line: number }>;
      try {
        sentences = sentencesIn(file);
      } catch {
        continue; // A page that no longer exists is not a claim.
      }
      for (const { text, line } of sentences) {
        for (const name of forbidden) {
          if (new RegExp(`\\b${name}\\b`).test(text)) {
            claims.push(`${file}:${line}  names ${name}`);
          }
        }
      }
    }

    expect(
      claims.sort(),
      "these pages tell a reader the product speaks a language it does not " +
        "offer on the sign-in screen; correct the copy, or add the language " +
        "to AUTH_LANGUAGES and ship a dictionary for it",
    ).toEqual([]);
  });

  it("counts them correctly when it counts them", () => {
    /*
     * "Six languages" names no language at all, so the rule above walks past
     * it -- and it was the heading over the sentence that rule was written
     * for. A count is the same claim said shorter.
     */
    const offered = languagesOffered().length;
    const wrong: string[] = [];
    for (const file of SALES_COPY) {
      let sentences: Array<{ text: string; line: number }>;
      try {
        // Two words, not four: "Six languages" is a whole claim and was the
        // heading over the sentence the rule above was written for.
        sentences = sentencesIn(file, 2);
      } catch {
        continue;
      }
      for (const { text, line } of sentences) {
        for (const match of text.matchAll(/\b([a-z]+|\d+) languages\b/gi)) {
          const said = /^\d+$/.test(match[1])
            ? Number(match[1])
            : COUNT_WORDS.indexOf(match[1].toLowerCase());
          if (said < 0) continue; // "all languages", "other languages"
          if (said !== offered) {
            wrong.push(`${file}:${line}  says ${match[0]}, offers ${offered}`);
          }
        }
      }
    }

    expect(
      wrong.sort(),
      "these say how many languages the product has and the number is not " +
        "the number of languages on the sign-in screen",
    ).toEqual([]);
  });

  it("has a dictionary for every language it offers", () => {
    /*
     * The other half of the same promise. Offering a language on the sign-in
     * screen with no dictionary behind it is the same lie told the other way
     * round: the reader picks it and the product stays in English.
     */
    const dictionaries = new Set(
      readdirSync(join(web, "lib/ui-translations"))
        .filter((name) => name.endsWith(".ts") && name !== "index.ts")
        .map((name) => name.replace(/\.ts$/, "")),
    );
    // English is the source language: it needs no dictionary to be itself.
    const missing = languagesOffered().filter(
      (code) => code !== "en" && !dictionaries.has(code),
    );

    expect(
      missing,
      "these are offered on the sign-in screen with no dictionary in " +
        "src/lib/ui-translations, so choosing one leaves the product in English",
    ).toEqual([]);
  });
});

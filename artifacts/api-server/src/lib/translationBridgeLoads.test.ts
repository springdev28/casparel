/**
 * Every language with a dictionary must actually load the bridge.
 *
 * The app entry decided whether to load UiTranslationBridge with
 * `getInitialLanguage() === "tr"`, written when Turkish was the only
 * dictionary there was. German, Spanish, French and Portuguese were added
 * afterwards -- five files, thousands of entries, a plural-rule table -- and
 * that line was not. So four of the six languages the app offers loaded no
 * bridge at all: the picker translated the login screen, which carries its own
 * copy, and the entire signed-in product stayed in English. Nothing failed,
 * nothing logged, and the dictionaries were right there being ignored.
 *
 * Two things are checked, because either alone lets it back in. The gate must
 * ask the list rather than name a language; and the list the entry asks --
 * `translated-languages.ts`, which lets the entry answer that without
 * importing a few hundred kilobytes of strings -- must still agree with the
 * dictionaries that exist.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appSrc = resolve(dirname(fileURLToPath(import.meta.url)), "../../../app/src");
const entry = readFileSync(resolve(appSrc, "App.tsx"), "utf8");
const index = readFileSync(resolve(appSrc, "lib/ui-translations/index.ts"), "utf8");
const languages = readFileSync(
  resolve(appSrc, "lib/translated-languages.ts"),
  "utf8",
);

/** The keys of the DICTIONARIES object literal. */
function dictionaryLanguages(): string[] {
  const start = index.indexOf("export const DICTIONARIES");
  expect(start, "DICTIONARIES is gone from the translation index").toBeGreaterThan(-1);
  const body = index.slice(start, index.indexOf("\n  };", start));
  return [...body.matchAll(/^\s{4}(\w+):/gm)].map((match) => match[1]).sort();
}

/** The codes the app entry consults, which must not import a dictionary. */
function advertisedLanguages(): string[] {
  const start = languages.indexOf("TRANSLATED_LANGUAGE_CODES");
  expect(start, "the code list is gone").toBeGreaterThan(-1);
  const body = languages.slice(start, languages.indexOf("];", start));
  return [...body.matchAll(/"(\w+)"/g)].map((match) => match[1]).sort();
}

describe("the translation bridge", () => {
  it("is gated on the list of languages, not on one language", () => {
    expect(
      entry,
      'the entry must ask hasDictionary(...), not name a language: === "tr" is ' +
        "how four languages came to render in English",
    ).toContain("hasDictionary(getInitialLanguage())");
    expect(entry).not.toMatch(/getInitialLanguage\(\)\s*===\s*"\w+"/);
    expect(entry).not.toMatch(/\.detail\s*===\s*"\w+"/);
  });

  it("loads for a language change too, by the same rule", () => {
    expect(entry).toContain(
      "setEnabled(hasDictionary((event as CustomEvent<AuthLanguage>).detail));",
    );
  });

  it("keeps the entry's list and the dictionaries in step", () => {
    expect(
      advertisedLanguages(),
      "translated-languages.ts and DICTIONARIES disagree, so some language either loads " +
        "a bridge with no dictionary or has a dictionary nothing loads",
    ).toEqual(dictionaryLanguages());
  });

  it("does not make the entry import the dictionaries", () => {
    // The bridge is lazy so its strings stay out of the entry chunk; importing
    // the index here to answer "is there a dictionary" would undo that.
    expect(languages).not.toMatch(/from "\.\/ui-translations/);
    expect(entry).toContain('from "./lib/translated-languages"');
    expect(entry).not.toMatch(/from "\.\/lib\/ui-translations"/);
  });
});

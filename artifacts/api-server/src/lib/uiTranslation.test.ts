/**
 * @fileOverview Verification role: exercises Ui Translation.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Every sentence describeApiError can show must exist in every dictionary.
 *
 * UiTranslationBridge is a MutationObserver that rewrites exact English strings
 * across the signed-in app. Matching is whole-string, so a sentence absent from
 * a dictionary is simply left in English, silently and only for the users who
 * cannot read it.
 *
 * That makes improving an error message quietly regressive: replacing a toast
 * that said "Error" (translated) with a better English sentence (untranslated)
 * is a net loss for a reader of that language. It nearly happened here — the
 * web-ux fix introduced ten new strings on top of two already covered.
 *
 * The dictionaries are found by listing the directory rather than by naming the
 * languages. They used to live inside the bridge itself and this file read it
 * by path; when they moved out into one module per language the test kept
 * reading the bridge, found no sentences in it and failed on all five — the
 * translations were there the whole time. A sixth language should be covered
 * the day it is added, not the day someone remembers this file.
 *
 * Reading them as text is deliberate. They are in another package, and the
 * point is to check what a reader of those files actually sees.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appSrc = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../app/src",
);
const errors = readFileSync(resolve(appSrc, "lib/api-error.ts"), "utf8");

const dictionaryDir = resolve(appSrc, "lib/ui-translations");
/** One module per language, plus an index that wires them together. */
const languages = readdirSync(dictionaryDir)
  .filter((name) => name.endsWith(".ts") && name !== "index.ts")
  .map((name) => ({
    language: name.replace(/\.ts$/, ""),
    text: readFileSync(resolve(dictionaryDir, name), "utf8"),
  }));

/**
 * The literals describeApiError returns. Template literals are skipped on
 * purpose: the bridge matches whole strings, so an interpolated sentence like
 * "Try again in 30 seconds" can never be translated by it, and asserting one
 * were present would be asking for something impossible.
 */
function returnedSentences(): string[] {
  const start = errors.indexOf("export function describeApiError");
  expect(start, "describeApiError is gone from api-error.ts").toBeGreaterThan(-1);
  const body = errors.slice(start);
  return [...body.matchAll(/return\s+"((?:[^"\\]|\\.)+)"/g)]
    .map((m) => m[1])
    .filter((s) => s.length > 12);
}

describe("every language covers the error sentences users are shown", () => {
  const sentences = returnedSentences();

  it("finds the sentences to check", () => {
    // A regex that stopped matching would turn every assertion below into a
    // vacuous pass, which is the failure this file exists to catch.
    expect(sentences.length).toBeGreaterThanOrEqual(5);
  });

  it("finds the dictionaries to check them against", () => {
    // Same reason: a moved directory must fail loudly here rather than leave
    // nothing to iterate over and report success.
    expect(languages.length).toBeGreaterThanOrEqual(1);
  });

  it.each(sentences)("translates %s", (sentence) => {
    const missing = languages
      .filter(({ text }) => !text.includes(`"${sentence}":`))
      .map(({ language }) => language);
    expect(
      missing,
      `no translation of "${sentence}" in ${missing.join(", ")}, so those readers see it in English`,
    ).toEqual([]);
  });
});

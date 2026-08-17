/**
 * Every sentence describeApiError can show must exist in the Turkish dictionary.
 *
 * UiTranslationBridge is a MutationObserver that rewrites exact English strings
 * to Turkish across the signed-in app. Matching is whole-string, so a sentence
 * absent from the dictionary is simply left in English, silently and only for
 * the users who cannot read it.
 *
 * That makes improving an error message quietly regressive: replacing a toast
 * that said "Error" (translated) with a better English sentence (untranslated)
 * is a net loss for a Turkish reader. It nearly happened here - the web-ux fix
 * introduced ten new strings on top of two the dictionary already covered.
 *
 * Reading both files as text is deliberate. They are in another package, and
 * the point is to check what a reader of those files actually sees.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appSrc = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../app/src",
);
const errors = readFileSync(resolve(appSrc, "lib/api-error.ts"), "utf8");
const dictionary = readFileSync(
  resolve(appSrc, "components/UiTranslationBridge.ts"),
  "utf8",
);

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

describe("Turkish covers the error sentences users are shown", () => {
  const sentences = returnedSentences();

  it("finds the sentences to check", () => {
    // A regex that stopped matching would turn every assertion below into a
    // vacuous pass, which is the failure this file exists to catch.
    expect(sentences.length).toBeGreaterThanOrEqual(5);
  });

  it.each(sentences)("translates %s", (sentence) => {
    expect(
      dictionary.includes(`"${sentence}":`),
      `UiTranslationBridge has no Turkish for "${sentence}", so Turkish readers see it in English`,
    ).toBe(true);
  });
});

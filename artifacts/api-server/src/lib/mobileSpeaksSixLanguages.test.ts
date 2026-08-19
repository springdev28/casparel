/**
 * Every string the phone app shows has a translation in all five languages.
 *
 * The app has no bridge and no DOM: each string is passed through `t()` where
 * it is written. That makes the source the whole truth, and makes this
 * checkable without a browser -- unlike the web app, where what the bridge
 * actually matched at runtime was the uncertain part and only a render could
 * answer it.
 *
 * Two directions, and both matter.
 *
 * A `t()` call with no entry falls back to English. That is the right runtime
 * behaviour and the wrong thing to ship: it is invisible, it is per-string,
 * and a screen ends up half in one language. So every key the source asks for
 * has to be in every dictionary.
 *
 * The other direction catches the more common mistake: an English sentence
 * that was never wrapped at all. The dictionaries cannot know about it, so
 * nothing above would notice. This reads the screens for text sitting in a
 * <Text> element or in a label, title or placeholder prop, and fails on
 * anything that looks like a sentence and is not going through `t()`.
 *
 * Product names are exempt by name, because they are the same in six
 * languages: Casparel, and the plan names Free, Plus and Pro.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
/*
 * Read as text rather than imported. This file lives in api-server, which is
 * where the repo keeps its cross-package source checks and the only package
 * whose tests have Node's fs; the mobile app is Expo and its tsconfig has no
 * node types. The dictionaries are flat string literals, one pair per line,
 * which is exactly what reading them as text can do reliably.
 */

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../mobile");
const i18n = join(appRoot, "lib/i18n");

/** The languages the picker offers, from the module that defines them. */
const LANGUAGE_CODES = [
  ...readFileSync(join(i18n, "index.ts"), "utf8").matchAll(/\{ code: "(\w+)"/g),
].map((match) => match[1]);

function dictionaryFor(language: string): Record<string, string> {
  const text = readFileSync(join(i18n, `${language}.ts`), "utf8");
  return Object.fromEntries(
    [...text.matchAll(/^ {2}("(?:[^"\\\\]|\\\\.)*"): ("(?:[^"\\\\]|\\\\.)*"),$/gm)].map(
      (match) => [JSON.parse(match[1]) as string, JSON.parse(match[2]) as string],
    ),
  );
}

function screens(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return screens(full);
    return entry.name.endsWith(".tsx") ? [full] : [];
  });
}

const files = [...screens(join(appRoot, "app")), ...screens(join(appRoot, "components"))].map(
  (path) => ({ where: relative(appRoot, path), text: readFileSync(path, "utf8") }),
);

/** `—` in the source is an em dash at runtime, and that is the key. */
function decode(text: string) {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

/** Every English string the app asks `t()` for. */
const asked = new Map<string, string>();
for (const { where, text } of files) {
  for (const match of text.matchAll(/\bt\((['"])((?:(?!\1).)*)\1\)/g)) {
    asked.set(decode(match[2]), where);
  }
}

/**
 * Strings held in a module constant and translated where they are rendered.
 *
 * A hook cannot be called at the top level of a module, so the onboarding
 * value props and the error-state table hold English and pass it through
 * `t()` at the render site. `t(title)` names a variable, so the scan above
 * cannot see what is in it; these two files are read for their literals.
 */
const CONSTANT_TABLES = ["app/onboarding.tsx", "components/ErrorState.tsx"];
for (const where of CONSTANT_TABLES) {
  const file = files.find((candidate) => candidate.where === where);
  expect(file, `${where} is gone; this list needs updating`).toBeTruthy();
  for (const match of file!.text.matchAll(
    /\b(?:title|body|description):\s*\n?\s*(['"])((?:(?!\1).)*)\1/g,
  )) {
    asked.set(decode(match[2]), where);
  }
}

/** The same in every language, so never translated. */
const PRODUCT_NAMES = new Set([
  "Casparel",
  "Free",
  "Plus",
  "Pro",
  "Student Plus",
  "Student Pro",
  "Teacher Plus",
  "Teacher Pro",
]);

const translated = LANGUAGE_CODES.filter((code) => code !== "en");

describe("the phone app's translations", () => {
  it("found the strings the screens ask for", () => {
    // A renamed helper or a changed call shape would empty this map, and an
    // empty map passes every assertion below without checking anything.
    expect(asked.size, "no t() calls found; has the helper been renamed?").toBeGreaterThan(
      100,
    );
  });

  it.each(translated)("covers all of them in %s", (language) => {
    const dictionary = dictionaryFor(language);
    const missing = [...asked]
      .filter(([english]) => !PRODUCT_NAMES.has(english) && !(english in dictionary))
      .map(([english, where]) => `${where}: ${JSON.stringify(english)}`);

    expect(
      missing,
      `these fall back to English for a ${language} reader, one string at a ` +
        `time, which is how a screen ends up half translated`,
    ).toEqual([]);
  });

  it("has the same keys in every language", () => {
    // Five files edited by hand drift. Comparing them to each other catches a
    // key added to one and forgotten in the rest, which the check above would
    // only find if the app happened to render that string.
    const [first, ...rest] = translated;
    const reference = Object.keys(dictionaryFor(first)).sort();
    for (const language of rest) {
      expect(Object.keys(dictionaryFor(language)).sort(), `${language} vs ${first}`).toEqual(
        reference,
      );
    }
  });

  it("leaves no user-facing English outside t()", () => {
    /*
     * Text that is the whole content of a <Text>, or the value of a prop the
     * user reads. Anything with a brace in it is interpolated and is somebody
     * else's problem; anything that does not start with a capital is a symbol,
     * an icon name or data rather than a sentence.
     */
    const sentence = /^[A-Z][A-Za-z0-9 ,.'’&%:!?()/-]{2,200}$/;
    const unwrapped: string[] = [];

    const lineOf = (text: string, index: number) =>
      text.slice(0, index).split("\n").length;

    for (const { where, text } of files) {
      // Across lines, because JSX wraps: the text and its closing tag are
      // usually not on the same line, and a line-by-line scan was blind to
      // exactly the shape this app is written in.
      for (const match of text.matchAll(
        /(?:^|>)\s*([^<>{}][^<>{}]*?)\s*<\/(?:Text|Button|Label|ThemedText)>/g,
      )) {
        const found = match[1].trim().replace(/\s+/g, " ");
        if (sentence.test(found) && !PRODUCT_NAMES.has(found)) {
          unwrapped.push(`${where}:${lineOf(text, match.index)}  ${JSON.stringify(found)}`);
        }
      }
      for (const match of text.matchAll(
        /\b(?:label|placeholder|accessibilityLabel|accessibilityHint|headerBackTitle)=["']([^"']+)["']/g,
      )) {
        if (sentence.test(match[1]) && !PRODUCT_NAMES.has(match[1])) {
          unwrapped.push(`${where}:${lineOf(text, match.index)}  ${JSON.stringify(match[1])}`);
        }
      }
    }

    expect(
      unwrapped,
      "these are shown to the reader in English whatever language they " +
        "chose; wrap them in t()",
    ).toEqual([]);
  });
});

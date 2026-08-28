/**
 * @fileOverview Verification role: exercises Mobile Speaks Its Languages.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
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
 * Product names are exempt by name, because they are the same in every
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

/**
 * Every source file that can ask for a string, which is not only the screens.
 *
 * This read `.tsx` alone, on the reasonable-sounding idea that user-facing
 * text lives in components. It does not: `utils/` holds the plain-TypeScript
 * modules that turn a failure into the sentence somebody reads --
 * auth-errors, purchase-errors, api-failure -- and the table that turns a
 * database enum into a word. Those call `t()` like anything else, and every
 * one of their strings was invisible here, so a missing translation in them
 * shipped silently in all five languages.
 *
 * Tests are skipped: their fixtures quote English on purpose.
 */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) return [];
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = [
  ...sources(join(appRoot, "app")),
  ...sources(join(appRoot, "components")),
  ...sources(join(appRoot, "utils")),
].map((path) => ({ where: relative(appRoot, path), text: readFileSync(path, "utf8") }));

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
const CONSTANT_TABLES = [
  "app/onboarding.tsx",
  "components/ErrorState.tsx",
  "app/paywall.tsx",
  /*
   * The step check-in's three answers. They are a table rather than three
   * buttons because each English word is also the number pair it stands for --
   * confidence 1..3 against understanding 1, 2 and 4 -- and that mapping has
   * to match the web's or a teacher's class signals describe two scales. The
   * word is also sent as the check-in's own reflection, so the English is
   * data as well as a label.
   */
  "components/StepCheckInSheet.tsx",
];
for (const where of CONSTANT_TABLES) {
  const file = files.find((candidate) => candidate.where === where);
  expect(file, `${where} is gone; this list needs updating`).toBeTruthy();
  for (const match of file!.text.matchAll(
    /\b(?:title|body|description|label):\s*\n?\s*(['"])((?:(?!\1).){4,})\1/g,
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
     * Every English sentence in the screens, wherever it sits.
     *
     * The first version of this looked only at <Text> children and a few
     * props, and passed while 65 strings were still English -- they were in
     * ternaries (`isTeacher ? 'Students' : 'Reviews'`), in Alert bodies, in
     * `description=` props, in `setError(...)`. The lesson is that a phone app
     * puts user-facing English in every shape a string literal comes in, so
     * the scan has to be the other way round: assume a sentence is for the
     * reader unless it is named below.
     */
    /*
     * The punctuation a sentence is allowed to contain.
     *
     * The ellipsis was missing, and three placeholders end in one -- "Search
     * resources…", "Tell others about yourself…", "Add a subject…" -- so they
     * failed the shape test and this file walked past them while reporting
     * everything else clean. A character class is a list of what counts, and
     * anything left off it is not a smaller check, it is a blind spot.
     */
    const sentence =
      /^[A-Z][A-Za-z0-9 ,.'\u2019\u2026\u2013\u2014&%:;!?()/"«»-]{3,240}$/;

    /**
     * Literals that are not shown to anybody, or that are the same in every
     * language. Each is a decision rather than an oversight.
     */
    const NOT_FOR_THE_READER = new Set([
      // Product and plan names, identical in every language.
      "Casparel",
      "Free",
      "Plus",
      "Pro",
      "Student Plus",
      "Student Pro",
      "Teacher Plus",
      "Teacher Pro",
      // The school licence, which is a plan name like the seven above it.
      "Institutional",
      "App Store",
      "Google Play",
      // RevenueCat package types and internal action names, compared against
      // rather than displayed.
      "ANNUAL",
      "MONTHLY",
      "TEMPLATE",
      // A RevenueCat error code, matched against a failure rather than shown.
      // Its siblings -- PURCHASE_CANCELLED, NETWORK_ERROR -- carry an
      // underscore and so never looked like a sentence; this one is a word.
      "OFFLINE",
      // A font family, not a word.
      "Menlo",
      /*
       * The subject chips on the profile screen. Tapping one stores it as the
       * account's subject, and the field is free text -- so translating the
       * chip would quietly write a different value to the database depending
       * on which language the phone happened to be in, and two accounts
       * studying the same thing would no longer match.
       */
      "Mathematics",
      "Science",
      "English",
      "History",
      "Computer Science",
      "Art",
      "Music",
      "Biology",
      "Chemistry",
      "Physics",
      "Economics",
      "Psychology",
    ]);

    /**
     * Where the comments are, so a sentence quoted inside one is not reported.
     *
     * Line-by-line was not enough: these files explain themselves in block
     * comments that run for paragraphs, and the words inside them are about
     * the code rather than shown by it.
     */
    function commentRanges(text: string): Array<[number, number]> {
      const ranges: Array<[number, number]> = [];
      for (const match of text.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g)) {
        ranges.push([match.index, match.index + match[0].length]);
      }
      return ranges;
    }

    const unwrapped: string[] = [];
    for (const { where, text } of files) {
      /*
       * JSX text with no quotes around it.
       *
       * The scan below reads string literals, which is where most of this
       * app's copy lives -- and it is blind to a heading written as plain
       * JSX. `Subjects &amp; Interests` sat in the profile screen through
       * three passes of this file because it is not a literal, is not a
       * prop, and the entity spelling means it does not even read as an
       * ampersand in the source. Found by looking at a screenshot.
       */
      for (const match of text.matchAll(
        /(?:^|>)\s*([^<>{}][^<>{}]*?)\s*<\/(?:Text|Button|Label|ThemedText)>/g,
      )) {
        const found = match[1]
          .trim()
          .replace(/\s+/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&nbsp;/g, " ");
        if (!sentence.test(found) || NOT_FOR_THE_READER.has(found)) continue;
        unwrapped.push(
          `${where}:${text.slice(0, match.index).split("\n").length}  ${JSON.stringify(found)}`,
        );
      }

      // The two tables whose English is translated where it is rendered.
      if (CONSTANT_TABLES.includes(where)) continue;
      const comments = commentRanges(text);

      for (const match of text.matchAll(/(['"])((?:(?!\1).){4,240})\1/g)) {
        const found = match[2];
        if (!sentence.test(found) || NOT_FOR_THE_READER.has(found)) continue;
        // Already going through the translator. `.trim()`, not `.trimEnd()`:
        // a long string is often on the line after the `t(` that wraps it.
        if (/\bt\(\s*$/.test(text.slice(Math.max(0, match.index - 40), match.index)))
          continue;
        if (comments.some(([from, to]) => match.index >= from && match.index < to)) continue;
        const lineStart = text.lastIndexOf("\n", match.index) + 1;
        const line = text.slice(lineStart, text.indexOf("\n", match.index + found.length));
        if (/^\s*import\b/.test(line)) continue;
        if (/console\.(?:log|warn|error)/.test(line)) continue;
        unwrapped.push(
          `${where}:${text.slice(0, match.index).split("\n").length}  ${JSON.stringify(found)}`,
        );
      }
    }

    expect(
      unwrapped,
      "these are shown to the reader in English whatever language they " +
        "chose; wrap them in t(), or name them in NOT_FOR_THE_READER with a " +
        "reason",
    ).toEqual([]);
  });

  it("tells the App Store the languages it can actually speak", () => {
    /*
     * CFBundleLocalizations is what iOS reports and what the App Store listing
     * shows under "Languages". It was absent, so a phone that had just been
     * taught another language would have been listed as English-only -- and
     * nobody searching the store in their own language would have found it.
     *
     * Checked against the dictionaries rather than against a copy of the list,
     * so the claim on the store page cannot outlive the translations behind
     * it, in either direction: a language added to the app has to be
     * declared, and a language declared here has to have a dictionary. That
     * also means dropping one is a single edit -- delete the dictionary and
     * the declaration follows, rather than the store advertising a language
     * the app no longer speaks.
     */
    const appJson = JSON.parse(readFileSync(join(appRoot, "app.json"), "utf8")) as {
      expo: { ios?: { infoPlist?: Record<string, unknown> } };
    };
    const declared = appJson.expo.ios?.infoPlist?.CFBundleLocalizations;

    expect(
      Array.isArray(declared),
      "no CFBundleLocalizations in app.json; iOS will report this app as " +
        "English-only whatever the dictionaries say",
    ).toBe(true);
    expect([...(declared as string[])].sort()).toEqual([...LANGUAGE_CODES].sort());
  });
});

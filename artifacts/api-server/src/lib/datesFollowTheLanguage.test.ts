/**
 * @fileOverview Verification role: exercises Dates Follow The Language.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * No date in the web app is formatted without being told which language.
 *
 * date-fns writes in English unless it is handed a locale, and nothing was
 * handing it one. So a reader who picked Español opened their schedule to
 * "Mon Aug 17" through "Sun Aug 23", their lists said "5 months ago", and
 * their inbox stamped every message "8/10/2026, 6:20:00 PM" -- English
 * wording and American order, surrounded by headings the app had translated
 * perfectly well. Measured on ten signed-in pages: eighteen of the sixty-eight
 * untranslated strings a Spanish reader could see were dates.
 *
 * The translation bridge cannot ever fix this, which is why it survived five
 * languages being added on top of it. The bridge matches whole strings against
 * a dictionary; "5 months ago" is a different string every month, and "in
 * about 2 hours" every hour, so there is no entry to write. These are exactly
 * the strings a whole-string bridge is blind to.
 *
 * The translation audit catches them by rendering, which is the real check --
 * but only on the pages it renders, and it needs a build, a browser and about
 * a minute. This is the cheap half: a new `format(...)` with no locale is a
 * failure here the moment it is written, on a page nobody has wired into the
 * audit yet.
 *
 * Read as text on purpose. The question is not what the modules export, it is
 * what somebody wrote in them.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appSrc = resolve(dirname(fileURLToPath(import.meta.url)), "../../../app/src");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = sources(appSrc).map((path) => ({
  path,
  where: relative(appSrc, path),
  text: readFileSync(path, "utf8"),
}));

/**
 * The one module allowed to name a locale, because it is the one that decides.
 */
const THE_DECIDER = "lib/date-locale.ts";

/**
 * Citations are written in the style's language, not the reader's.
 *
 * APA and MLA specify English month names and English abbreviations; a
 * bibliography entry a student pastes into an essay has to match the style
 * guide their teacher marks against, whatever language the app is in. So
 * `citations.ts` names "en" deliberately and is the one place that should.
 */
const FORMATS_IN_ITS_OWN_LANGUAGE = "lib/citations.ts";

const EXEMPT = new Set([THE_DECIDER, FORMATS_IN_ITS_OWN_LANGUAGE]);

/**
 * Every line, with its file and 1-based number, so a failure points at it.
 *
 * Two lines of context ride along because these calls wrap: the argument that
 * makes a call correct is often on the line after the one naming it.
 */
const lines = files.flatMap(({ where, text }) => {
  const all = text.split("\n");
  return all.map((line, index) => ({
    where,
    line: index + 1,
    text: line,
    /** The call and what follows it, which is where `locale` usually is. */
    statement: all.slice(index, index + 4).join("\n"),
  }));
});

/** A `//` or `*` line is a description of code rather than code. */
function isProse(text: string) {
  return /^\s*(\*|\/\/|\/\*)/.test(text);
}

describe("dates in the web app", () => {
  it("has a file to read at all", () => {
    // A glob that matched nothing would make every assertion below vacuous.
    expect(files.length).toBeGreaterThan(50);
  });

  it("never asks date-fns to format without a locale", () => {
    /*
     * `format(date, "EEE, MMM d")` and `formatDistanceToNow(date, {...})`.
     * A numeric pattern -- yyyy-MM-dd, HH:mm -- is a key or a clock rather
     * than wording, reads the same in every language, and is exempt: the
     * schedule stores its dates that way and its 24-hour clock is a decision
     * of its own.
     */
    const offenders = lines.filter(({ where, text, statement }) => {
      if (EXEMPT.has(where)) return false;
      if (isProse(text)) return false;
      // `(...).format(x)` is Intl's method, covered by the check below;
      // only a bare call is date-fns'.
      if (!/(?:^|[^.\w])(?:formatDistanceToNow|formatDistance|formatRelative|format)\(/.test(text))
        return false;
      // The locale may be on this line or a line or two down: these calls wrap.
      if (/\blocale\b/.test(statement)) return false;
      /*
       * Only a pattern with words in it needs a language. Month and day
       * *names* come from MMM/MMMM, LLL, EEE, ccc and friends; era, am/pm and
       * the ordinal `do` too. A pattern of digits -- yyyy-MM-dd, HH:mm --
       * reads identically in all six, and the schedule stores its dates in
       * the first and shows its clock in the second on purpose.
       */
      const pattern = /format\([^,]+,\s*"([^"]*)"/.exec(text);
      if (pattern && !/MMM|LLL|E|c|e|i|a|b|B|G|do|PP?|p/.test(pattern[1])) return false;
      return true;
    });

    expect(
      offenders.map((o) => `${o.where}:${o.line}  ${o.text.trim().slice(0, 90)}`),
      "date-fns formats in English unless given a locale; pass " +
        "{ locale } from useDateLocale()",
    ).toEqual([]);
  });

  it("never asks the platform to format without a locale", () => {
    /*
     * `toLocaleString()` with no argument means "the browser's locale", which
     * is the machine's language rather than the reader's chosen one -- and the
     * two disagree for anybody using the app in a language their computer is
     * not set to, which is most of the point of offering six.
     */
    const offenders = lines.filter(
      ({ where, text, statement }) =>
        !EXEMPT.has(where) &&
        !isProse(text) &&
        (/\.toLocale(?:Date|Time)?String\(\s*\)/.test(text) ||
          (/new Intl\.(?:DateTime|Number|RelativeTime)Format\(\s*(?:undefined)?\s*[,)]/.test(
            statement,
          ) &&
            !isProse(text))),
    );

    expect(
      offenders.map((o) => `${o.where}:${o.line}  ${o.text.trim().slice(0, 90)}`),
      "pass intlLocale(language) or useIntlLocale(); a bare call uses the " +
        "browser's language, not the reader's",
    ).toEqual([]);
  });

  it("never names one language and leaves the other five to chance", () => {
    /*
     * This is how the bug hid. Somebody knew dates should follow the language,
     * did it for Turkish -- `language === "tr" ? "tr-TR" : undefined` -- and
     * the other four dictionaries arrived later against a ternary that had no
     * room for them. A conditional locale tag is that same shape.
     */
    const offenders = lines.filter(
      ({ where, text }) =>
        !EXEMPT.has(where) &&
        !isProse(text) &&
        // A tag used for formatting a date or a number. `toLocaleLowerCase`
        // takes one too, and there it is about letter case -- Turkish dotless
        // i -- rather than about which language the reader picked.
        /(?:toLocale(?:Date|Time)?String|(?:DateTime|Number|RelativeTime)Format)\([^)]*"(?:en|es|fr|de|pt|tr)-[A-Z]{2}"/.test(
          text,
        ),
    );

    expect(
      offenders.map((o) => `${o.where}:${o.line}  ${o.text.trim().slice(0, 90)}`),
      "a hardcoded locale tag covers one language; lib/date-locale.ts covers six",
    ).toEqual([]);
  });

  it("has a date-fns locale and an Intl tag for every language on offer", () => {
    /*
     * The other half of the same disagreement. Adding a seventh language is
     * one line in the picker; without a line in each of these two tables it
     * would format in English again, and nothing else would say so.
     *
     * Each table is sliced out by name rather than searched for as a whole,
     * because they overlap: written the obvious way, "is `es` in the file"
     * was answered by the Intl table for both, and dropping Spanish from the
     * date-fns one passed. Two tables, two questions.
     */
    const decider = readFileSync(resolve(appSrc, THE_DECIDER), "utf8");
    const picker = readFileSync(resolve(appSrc, "lib/auth-locale.ts"), "utf8");
    const offered = [...picker.matchAll(/\{\s*code:\s*"(\w+)"/g)].map((m) => m[1]);

    const table = (name: string) => {
      const at = decider.indexOf(`const ${name}`);
      expect(at, `${name} is not in ${THE_DECIDER}`).toBeGreaterThan(-1);
      return decider.slice(at, decider.indexOf("};", at));
    };
    const dateFns = table("LOCALES");
    const intl = table("INTL_TAGS");

    /*
     * That the picker was read at all, not how long it is.
     *
     * This asked for at least six, which was the number the day it was
     * written. The list is a product decision -- it went to English and
     * Turkish -- and a test that pins the count turns every such decision
     * into a failing build with nothing wrong behind it. Two is the floor:
     * English, and at least one language to be translated into.
     */
    expect(offered.length, "no languages found in the picker").toBeGreaterThanOrEqual(2);
    for (const code of offered) {
      // Shorthand (`es,`) or a mapping (`pt: ptBR,`) -- both are an answer.
      expect(dateFns, `${code} has no date-fns locale`).toMatch(
        new RegExp(`^\\s+${code}(?::\\s*\\w+)?,`, "m"),
      );
      expect(intl, `${code} has no Intl tag`).toMatch(
        new RegExp(`^\\s+${code}: "[a-z]{2}-[A-Z]{2}"`, "m"),
      );
    }
  });
});

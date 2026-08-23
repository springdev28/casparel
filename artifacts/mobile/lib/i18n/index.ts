/**
 * @fileOverview Mobile support role: configures or implements Index for the Expo application.
 * System connection: supports native build/runtime behavior and communication with the same API used by web and desktop.
 */
/**
 * The phone app in the language the account already chose.
 *
 * The web app offers English and Turkish, and stores the choice on
 * the account so it follows the person rather than the device. The phone app
 * had no idea any of that existed: somebody who set Türkçe on the web, closed
 * the laptop and opened the phone got English, on the same account, on the
 * same day.
 *
 * Keyed by the exact English string, deliberately. It is the same convention
 * the web dictionaries use, so a sentence that appears in both products is
 * looked up under the same key and the two translations can be compared. It
 * also means a missing entry degrades to English rather than to a raw
 * `screens.profile.signOut`, which is the failure mode that makes key-based
 * schemes leak developer wording into a release.
 *
 * There is no MutationObserver here and there cannot be: React Native has no
 * DOM. So every string is passed through `t()` at the point it is written,
 * which is more work up front and considerably more honest -- an untranslated
 * string is visible in the source rather than hiding behind a bridge that
 * silently did not match.
 */
import tr from "./tr";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "tr", label: "Türkçe" },
] as const;

export type Language = (typeof LANGUAGES)[number]["code"];

const DICTIONARIES: Partial<Record<Language, Record<string, string>>> = {
  tr,
};

/**
 * The BCP-47 tag for Intl, which is what names days and months.
 *
 * A dictionary cannot hold "Wednesday": the schedule strip shows seven of
 * them and they change every week. The phone hand-rolled its own English
 * arrays instead -- `['Mon', 'Tue', …]` -- so the week strip read Mon Tue Wed
 * over a screen that was otherwise entirely in Turkish. Intl already knows
 * this in every language; it only needed to be told which one.
 *
 */
const INTL_TAGS: Record<Language, string> = {
  // en-GB rather than en-US, for the 24-hour clock. The web app made that
  // choice deliberately -- one clock per product -- and the phone was showing
  // 12-hour for the same blocks, which is the two-clocks problem across two
  // clients rather than within one screen.
  en: "en-GB",
  tr: "tr-TR",
};

export function intlLocale(language: Language): string {
  return INTL_TAGS[language] ?? "en-GB";
}

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((entry) => entry.code === value);
}

/**
 * Translate one string, or hand back the English it was given.
 *
 * `language` is passed in rather than read from a module-level variable so
 * that a screen re-renders when it changes -- the value comes from a React
 * context, and a hidden global would leave the old language on screen until
 * something else happened to re-render.
 */
export function translate(english: string, language: Language): string {
  if (language === "en") return english;
  return DICTIONARIES[language]?.[english] ?? english;
}

/**
 * Every string the dictionaries know, for the audit that checks the screens.
 *
 * Exported so a test can ask "is this English sentence covered" without
 * importing five modules and knowing how they are wired together.
 */
export function dictionaryFor(language: Language): Record<string, string> {
  return DICTIONARIES[language] ?? {};
}

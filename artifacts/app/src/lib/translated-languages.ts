/**
 * Which languages have a dictionary -- the codes alone, no dictionaries.
 *
 * `index.ts` already derives this from `DICTIONARIES`, but importing it there
 * pulls all five dictionaries into whatever bundle asks. The one caller that
 * needs the answer is the app entry, deciding whether to load the translation
 * bridge at all, and dragging a few hundred kilobytes of strings into the
 * entry chunk to answer "is there anything to load" would defeat the point of
 * loading the bridge lazily.
 *
 * They live beside the dictionaries rather than inside that directory,
 * because every file in there is a dictionary -- the audit script and several
 * tests read it that way, and a module with no translations in it would read
 * as a language missing every string. So the codes live here, and `translationBridgeLoads.test.ts`
 * checks this list still matches the dictionaries that exist. Adding a
 * language means adding it in both places; forgetting is a failing test rather
 * than a language that silently renders in English.
 */
import type { AuthLanguage } from "./auth-locale";

export const TRANSLATED_LANGUAGE_CODES: readonly AuthLanguage[] = [
  "tr",
  "es",
  "fr",
  "pt",
  "de",
];

export function hasDictionary(language: AuthLanguage): boolean {
  return TRANSLATED_LANGUAGE_CODES.includes(language);
}

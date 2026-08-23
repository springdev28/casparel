/**
 * @fileOverview Web domain role: centralizes Translated Languages state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
/**
 * Which languages have a dictionary -- the codes alone, no dictionaries.
 *
 * `index.ts` derives this from its loader table, but the one caller that needs
 * the answer is the app entry, deciding whether to load the translation bridge
 * at all -- and importing that module pulls in the plural rules and shape
 * rules with it, to answer "is there anything to load".
 *
 * It used to pull in far more than that: the dictionaries were static imports,
 * so asking `index.ts` anything dragged all five, a few hundred kilobytes of
 * strings, into the entry chunk. They are dynamic imports now, so the cost of
 * the alternative is smaller than it was -- but the entry still only needs a
 * list of five codes, and this is that list.
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
];

export function hasDictionary(language: AuthLanguage): boolean {
  return TRANSLATED_LANGUAGE_CODES.includes(language);
}

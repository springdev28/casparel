/**
 * @fileOverview Web domain role: centralizes Date Locale state, transformation, navigation, telemetry, or API-adapter behavior.
 * System connection: imported by pages/components so business rules are testable without rendering an entire route.
 */
/**
 * The date-fns locale for whichever language the reader chose.
 *
 * Every date in the signed-in app is written by date-fns, and date-fns
 * formats in English unless it is handed a locale. Nothing was handing it
 * one. So a reader who picked Türkçe saw their schedule week as "Mon Aug 17"
 * through "Sun Aug 23", their reading lists "5 months ago", and their study
 * sessions "Thu, Aug 20" -- in an app that had already translated every
 * heading around them.
 *
 * The translation bridge could not have covered this and never will. It
 * matches whole strings against a dictionary, and no dictionary can hold
 * "5 months ago" -- the number changes, so the string is different every time
 * it is rendered. These are the strings a bridge structurally cannot reach,
 * which is exactly why they survived five languages being added.
 *
 * The locales are imported outright rather than fetched. All five together
 * are a few kilobytes next to the dictionaries, they are needed during the
 * first paint of a page that shows a date, and a date that arrives a frame
 * late in the right language is worse than one that was never wrong.
 */
import { useEffect, useState } from "react";
import { de, enUS, es, fr, ptBR, tr } from "date-fns/locale";
import {
  getInitialLanguage,
  type AuthLanguage,
} from "./auth-locale";

/** The event `useAuthLanguage().setLanguage` fires; also fired on sign-in. */
const LANGUAGE_EVENT = "schoolar-language-change";

/**
 * Portuguese is pt-BR, not pt-PT.
 *
 * date-fns ships both. They differ in date wording, and the dictionary this
 * app ships was written in Brazilian Portuguese, so the two halves of a
 * sentence would otherwise be from different countries.
 */
const LOCALES: Record<AuthLanguage, typeof enUS> = {
  en: enUS,
  tr,
};

export function dateLocale(language: AuthLanguage): typeof enUS {
  return LOCALES[language] ?? enUS;
}

/**
 * The BCP-47 tag for `toLocaleString` and friends, for the same reason.
 *
 * A handful of places format with the platform's own Intl rather than
 * date-fns. Those called `toLocaleString()` with no argument, which uses the
 * *browser's* locale -- so a reader who picked Türkçe on a machine set to
 * English got "8/10/2026, 6:20:00 PM" in their inbox. One place did pass a
 * tag, `"tr-TR"`, and only for Turkish; the other four languages fell through
 * to the same undefined. This is the answer for every language on offer.
 */
const INTL_TAGS: Record<AuthLanguage, string> = {
  // en-GB rather than en-US, to match the 24-hour clock the schedule already
  // decided on: two clocks on one screen is the thing that decision avoided,
  // and it would come straight back if the inbox printed 6:20:00 PM.
  en: "en-GB",
  tr: "tr-TR",
};

export function intlLocale(language: AuthLanguage): string {
  return INTL_TAGS[language] ?? "en-GB";
}

/** The language, kept current as the reader changes it. */
function useLanguage(): AuthLanguage {
  const [language, setLanguage] = useState<AuthLanguage>(getInitialLanguage);

  useEffect(() => {
    const onChange = (event: Event) => {
      setLanguage((event as CustomEvent<AuthLanguage>).detail);
    };
    document.addEventListener(LANGUAGE_EVENT, onChange);
    return () => document.removeEventListener(LANGUAGE_EVENT, onChange);
  }, []);

  return language;
}

/**
 * Re-renders when the language changes, so dates switch with everything else.
 *
 * `useAuthLanguage` keeps its own copy of the language per component and does
 * not listen for the event, so a component using it alone would keep showing
 * English dates until something else re-rendered it. This listens.
 */
export function useDateLocale(): typeof enUS {
  return dateLocale(useLanguage());
}

export function useIntlLocale(): string {
  return intlLocale(useLanguage());
}

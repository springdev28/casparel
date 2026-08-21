/**
 * Which language this phone is showing, and where that answer comes from.
 *
 * Three sources, in this order:
 *
 *  1. What the person picked on this phone, kept in storage so the choice
 *     survives a restart and is available before any network call returns.
 *  2. The account preference, fetched once after sign-in. This is the reason
 *     the context exists at all: the language is a property of the person,
 *     not of the device, and somebody who chose Türkçe on the web should not
 *     have to choose it again here.
 *  3. English.
 *
 * The account wins over the device only when the device has never been told.
 * Otherwise a person who deliberately switches the phone to English would
 * have it switched back under them on the next launch.
 *
 * Preferences come through the generated client. They used to be read with a
 * hand-rolled `fetch`, because /users/me/preferences was not in openapi.yaml
 * and there was no hook to call -- which is the same gap that left this app
 * without flashcards and without messages, and is now held by
 * contractDescribesEveryRoute.test.ts.
 *
 * A failure here is silent on purpose: not knowing the account's language is a
 * reason to stay in the one already on screen, not a reason to show an error.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getMyPreferences,
  updateMyPreferences,
} from "@workspace/api-client-react";
import { storage } from "@/utils/secure-storage";
import { intlLocale, isLanguage, translate, type Language } from "@/lib/i18n";
import { useAuth } from "./AuthContext";

const LANGUAGE_KEY = "casparel_language";

interface LanguageContextValue {
  language: Language;
  /** Translate an English string into the current language. */
  t: (english: string) => string;
  /** The BCP-47 tag, for the day and month names no dictionary can hold. */
  intlLocale: string;
  /** Change it here and on the account, so the other clients follow. */
  setLanguage: (next: Language) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [language, setLanguageState] = useState<Language>("en");
  /** Whether this device has a choice of its own, which the account cannot override. */
  const [chosenHere, setChosenHere] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await storage.getItemAsync(LANGUAGE_KEY);
      if (cancelled || !isLanguage(stored)) return;
      setLanguageState(stored);
      setChosenHere(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token || chosenHere) return;
    let cancelled = false;
    void (async () => {
      try {
        const preferences = await getMyPreferences();
        if (cancelled || !isLanguage(preferences.language)) return;
        setLanguageState(preferences.language);
      } catch {
        // Offline, or the endpoint is unreachable. Stay where we are.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, chosenHere]);

  const setLanguage = useCallback(
    async (next: Language) => {
      setLanguageState(next);
      setChosenHere(true);
      await storage.setItemAsync(LANGUAGE_KEY, next);
      if (!token) return;
      try {
        // So the web and the desktop shell follow. Failing to save is not
        // worth an error on screen: the phone is already in the new language.
        await updateMyPreferences({ language: next });
      } catch {
        // Saved on this phone regardless.
      }
    },
    [token],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      t: (english: string) => translate(english, language),
      intlLocale: intlLocale(language),
      setLanguage,
    }),
    [language, setLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

/**
 * The translator, and the language it is translating into.
 *
 * Usable outside the provider, returning English, so a component rendered by
 * an error boundary above the provider -- which is where a crash lands -- does
 * not throw a second time while trying to describe the first.
 */
export function useLanguage(): LanguageContextValue {
  return (
    useContext(LanguageContext) ?? {
      language: "en",
      t: (english: string) => english,
      intlLocale: intlLocale("en"),
      setLanguage: async () => {},
    }
  );
}

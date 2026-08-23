/**
 * @fileOverview Verification role: distinguishes auth-page translations from languages supported across every signed-in route.
 * System connection: protects Settings and AppShell from persisting a partial interface locale as an account-wide preference.
 */
import { describe, expect, it } from "vitest";
import {
  AUTH_LANGUAGES,
  INTERFACE_LANGUAGES,
  isInterfaceLanguage,
} from "./auth-locale";

describe("supported interface languages", () => {
  it("offers only complete English and Turkish translations in signed-in settings", () => {
    expect(INTERFACE_LANGUAGES.map(({ code }) => code)).toEqual(["en", "tr"]);
  });

  it("keeps the broader localized authentication entry points distinct", () => {
    expect(AUTH_LANGUAGES.map(({ code }) => code)).toEqual([
      "en",
      "es",
      "fr",
      "de",
      "pt",
      "tr",
    ]);
    expect(isInterfaceLanguage("fr")).toBe(false);
    expect(isInterfaceLanguage("tr")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import TR from "./tr";

/**
 * The strings a reader must never meet in English.
 *
 * The browser audit (scripts/audit-translation.mjs) is the thorough check: it
 * renders the real pages and reads what is actually on screen. It needs a
 * build and a browser, so it runs in CI rather than on every save, and it can
 * only see the pages it visits and the states it can reach — a purchase
 * error, an offline notice, or a paid-account plan control may never appear
 * during a crawl.
 *
 * This is the cheap half, and it exists so that adding a control without its
 * translation fails immediately rather than at the next full audit. It covers
 * the areas the product cannot be shipped half-translated in: navigation,
 * plans and purchases, errors, advertising, notifications, account controls,
 * roles, appearance, and the empty and offline states.
 *
 * Adding a string to one of these surfaces means adding it here and to every
 * dictionary. That is the point: the list is the contract.
 */
const REQUIRED: Record<string, string[]> = {
  navigation: [
    "Dashboard",
    "Classes",
    "Goals",
    "Activities",
    "Resources",
    "Schedule",
    "Messages",
    "Settings",
    "People",
    "Browse",
    "Plans",
    "Log in",
    "Sign in",
    "Create account",
  ],
  "plans and purchases": [
    "Compare plans",
    "Current plan",
    "Switch to Plus",
    "Switch to Pro",
    "Change billing period",
    "Your plan, billed yearly",
    "Your plan, billed monthly",
    "Manage billing",
  ],
  advertising: [
    "Advertisement",
    "Close this advertisement",
    "Allow ads",
    "No thanks",
    "Ad sound",
    "Disable ads",
    "Available with Casparel Pro or Institutional.",
  ],
  notifications: [
    "Notifications",
    "Allow notifications",
    "Messages",
    "Schedule reminders",
  ],
  "account and roles": ["Student", "Teacher", "Profile", "Sign out"],
  appearance: ["Appearance", "Light", "Dark", "System"],
  "empty and offline states": ["You're offline", "Try again", "Nothing here yet"],
};

describe("the web dictionary", () => {
  for (const [area, keys] of Object.entries(REQUIRED)) {
    it(`translates every ${area} string a reader can meet`, () => {
      const missing = keys.filter((key) => {
        const value = (TR as Record<string, string>)[key];
        return typeof value !== "string" || value.trim().length === 0;
      });
      expect(
        missing,
        `these fall back to English for a Turkish reader, which is how a screen ends up half translated. Add them to src/lib/ui-translations/tr.ts`,
      ).toEqual([]);
    });
  }

  it("has no entry that is merely the English copied across", () => {
    // A key whose "translation" is the same string is the shape a
    // half-finished dictionary takes, and it reads as translated to every
    // automated check that only asks whether the key exists. Product names
    // are the legitimate exception: they are the same in every language.
    const SAME_IN_TURKISH = new Set([
      // Product and brand names.
      "Casparel",
      "Free",
      "Plus",
      "Pro",
      "Institutional",
      "Google Play",
      "App Store",
      "Google",
      "Microsoft",
      "LinkedIn",
      "Wikibooks",
      "Open Library",
      // Loanwords Turkish spells exactly as English does. Translating these
      // to something else would be worse than leaving them.
      "Plan",
      "Platform",
      "Podcast",
      "Video",
      "AI",
      "PDF",
      "URL",
      "OK",
      "Email",
      // A units sample, not prose.
      "12 MB / 100 MB",
    ]);
    const identical = Object.entries(TR as Record<string, string>)
      .filter(([key, value]) => key === value && !SAME_IN_TURKISH.has(key))
      .map(([key]) => key);
    expect(identical).toEqual([]);
  });
});

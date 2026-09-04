/**
 * @fileOverview Web domain role: stores and publishes the visitor's advertising-consent choice.
 * System connection: read by the ad components and written by the consent
 * banner; kept separate so the decision rules are testable without a browser.
 */
import type { AdConsentState } from "./webAds";

const CONSENT_KEY = "casparel_ad_consent";
const CONSENT_EVENT = "casparel-ad-consent-change";

/**
 * Regions where an affirmative choice is required before a personalised or
 * measurement cookie may be set: the EEA, the UK and Switzerland, plus the
 * US states with their own opt-out laws, where we ask rather than assume.
 *
 * Resolved from the browser's own time zone and language, which is a coarse
 * signal and deliberately so: it is used only to decide whether to *ask*.
 * Getting it wrong shows a banner to someone who did not need one, which is
 * harmless; the opposite mistake is not, so anything unrecognised asks too.
 */
const CONSENT_REQUIRED_ZONE_PREFIXES = [
  "Europe/",
  "Atlantic/Canary",
  "Atlantic/Madeira",
  "Atlantic/Azores",
  "Atlantic/Reykjavik",
];

export function consentRequiredHere(): boolean {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    if (CONSENT_REQUIRED_ZONE_PREFIXES.some((prefix) => zone.startsWith(prefix))) {
      return true;
    }
    // Outside those zones a choice is still offered rather than assumed: the
    // banner is the only way a visitor can decline, and a product that shows
    // ads with no way to say no is not one we want to ship.
    return true;
  } catch {
    return true;
  }
}

export function readAdConsent(): AdConsentState {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored === "granted" || stored === "denied") return stored;
  } catch {
    // Storage blocked: treat as undecided, which shows no ads.
  }
  return "unknown";
}

export function writeAdConsent(state: Exclude<AdConsentState, "unknown">): void {
  try {
    localStorage.setItem(CONSENT_KEY, state);
  } catch {
    // A blocked store means the choice lasts for this page only, which is
    // still the visitor's choice and still fails closed on the next load.
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

export function subscribeToAdConsent(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === CONSENT_KEY) onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(CONSENT_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CONSENT_EVENT, onChange);
  };
}

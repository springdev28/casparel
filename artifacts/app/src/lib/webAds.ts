/**
 * @fileOverview Web domain role: decides whether a web advertising slot may render, and how it is configured.
 * System connection: imported by the InlineAd component and by Settings, so the
 * eligibility rules are testable without a browser or a live ad network.
 */
/**
 * Web advertising, through Google AdSense.
 *
 * Deliberately not AdMob: AdMob's native ad units are for apps, and reusing
 * an Android native unit on a website violates its policy and would not fill.
 * The website is a separate AdSense property under the same publisher, so the
 * client id is configured on its own rather than derived from the Android app
 * id or hardcoded from `app-ads.txt`.
 *
 * Set at build time (GitHub → Settings → Secrets and variables → Actions →
 * Variables, read by .github/workflows/deploy-frontend.yml):
 *
 *   VITE_ADSENSE_CLIENT_ID   ca-pub-0000000000000000
 *   VITE_ADSENSE_SLOT_INLINE  0000000000
 *
 * Unset means no advertising, which stays the default: `VITE_*` values are
 * inlined at build time, so an absent one is absent for the life of that
 * bundle and "absent" must therefore be the safe state. Nothing is loaded,
 * no request reaches Google, and the page renders exactly as it does today.
 */

const env = import.meta.env as Record<string, unknown>;

function configured(value: unknown, pattern: RegExp): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return pattern.test(trimmed) ? trimmed : null;
}

/** AdSense publisher for this website, e.g. "ca-pub-1234567890123456". */
export const ADSENSE_CLIENT_ID = configured(
  env.VITE_ADSENSE_CLIENT_ID,
  /^ca-pub-\d{10,20}$/,
);

/** The responsive display unit used for in-content placements. */
export const ADSENSE_INLINE_SLOT = configured(
  env.VITE_ADSENSE_SLOT_INLINE,
  /^\d{6,20}$/,
);

export function webAdsConfigured(): boolean {
  return ADSENSE_CLIENT_ID !== null && ADSENSE_INLINE_SLOT !== null;
}

/**
 * Exactly which piece of configuration is missing, for an administrator.
 * Never shown to an ordinary visitor: a variable name is not something they
 * can act on, and an empty space where an ad would be is not an error to them.
 */
export function webAdsConfigurationProblem(): string | null {
  if (ADSENSE_CLIENT_ID === null && ADSENSE_INLINE_SLOT === null) {
    return "VITE_ADSENSE_CLIENT_ID and VITE_ADSENSE_SLOT_INLINE are not set in the frontend build environment, so no web advertising is served.";
  }
  if (ADSENSE_CLIENT_ID === null) {
    return "VITE_ADSENSE_CLIENT_ID is missing or not in the ca-pub-… form, so no web advertising is served.";
  }
  if (ADSENSE_INLINE_SLOT === null) {
    return "VITE_ADSENSE_SLOT_INLINE is missing or not a numeric AdSense slot id, so no web advertising is served.";
  }
  return null;
}

export type AdConsentState = "granted" | "denied" | "unknown";

export interface WebAdEligibility {
  /** The build carries a client id and a slot. */
  configured: boolean;
  /** True inside the Android WebView, which renders its own native ads. */
  nativeShell: boolean;
  /** The account's saved Disable ads preference. */
  adsDisabled: boolean;
  /** Whether that preference is allowed to take effect (Pro/Review/higher). */
  canDisableAds: boolean;
  /** Privacy consent, where a region requires one. */
  consent: AdConsentState;
  /** True while the account's plan or preferences are still loading. */
  pending: boolean;
}

/**
 * Whether one advertising slot may render.
 *
 * Fails closed on everything uncertain: no configuration, no consent, an
 * unfinished plan lookup, or a page inside the native shell all mean no ad.
 * A slot that does not render leaves no gap — the component returns null and
 * the surrounding page closes up.
 */
export function mayShowWebAd(eligibility: WebAdEligibility): boolean {
  if (!eligibility.configured) return false;
  // The Android app aligns its own AdMob view with an inline page placeholder;
  // an AdSense request here would be a second advertisement in the same slot.
  if (eligibility.nativeShell) return false;
  if (eligibility.pending) return false;
  if (eligibility.consent !== "granted") return false;
  if (eligibility.canDisableAds && eligibility.adsDisabled) return false;
  return true;
}

/**
 * Routes that never carry advertising.
 *
 * Editing-heavy and sensitive surfaces: anything where an advertisement would
 * compete with a form the person is filling in, or sit beside private
 * correspondence, payment details or credentials.
 */
const EXCLUDED_PREFIXES = [
  "/settings",
  "/profile",
  "/auth",
  "/plans",
  "/admin",
  "/messages",
  "/delete-account",
  "/reset-account",
  "/canvas",
  "/support",
  "/terms",
  "/privacy",
];

export function pathAllowsWebAd(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (/^\/(?:canvases|classes)\/[^/]+/.test(path)) return false;
  return !EXCLUDED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Load the AdSense library once per page, and only when a slot actually
 * needs it. Resolves false when it cannot load (blocked, offline, or the
 * network refusing), which callers treat as "no ad" rather than an error.
 */
let loader: Promise<boolean> | null = null;

export function loadAdSense(): Promise<boolean> {
  if (!webAdsConfigured()) return Promise.resolve(false);
  if (loader) return loader;
  loader = new Promise<boolean>((resolve) => {
    if (typeof document === "undefined") {
      resolve(false);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-casparel-adsense]",
    );
    if (existing) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.casparelAdsense = "true";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
    script.addEventListener("load", () => resolve(true));
    script.addEventListener("error", () => {
      // An ad blocker, an offline tab, or a network failure. None of these
      // are the reader's problem and none of them may break the page.
      loader = null;
      resolve(false);
    });
    document.head.appendChild(script);
  });
  return loader;
}

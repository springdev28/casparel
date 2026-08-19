/**
 * Where Casparel can be installed from, and whether it can be yet.
 *
 * The three store links used to be `null` constants inside LandingPage, with
 * the right instinct behind them — a dead download link is worse than an
 * honest "coming soon" — but the wrong mechanism: flipping one on meant
 * editing a page component, and the two surfaces that need the same answer
 * (the hero and the download page) would each have their own copy of it.
 *
 * They are build-time environment values instead, so a store approval is a
 * deploy variable rather than a code change, and every surface reads one
 * answer. Unset means not live, which stays the default: `VITE_*` values are
 * inlined by Vite at build time, so an absent one is absent forever in that
 * bundle, and "absent" must therefore be the safe state.
 *
 * Set at build time (GitHub → Settings → Secrets and variables → Actions →
 * Variables, read by .github/workflows/deploy-frontend.yml):
 *
 *   VITE_IOS_APP_URL          https://apps.apple.com/app/id...
 *   VITE_ANDROID_APP_URL      https://play.google.com/store/apps/details?id=...
 *   VITE_DESKTOP_DOWNLOAD_URL https://github.com/.../releases/latest
 */

export type PlatformId = "ios" | "android" | "desktop";

export interface DownloadTarget {
  id: PlatformId;
  /** Button copy: what the visitor gets. */
  label: string;
  /** What the platform is, for the download page's card. */
  description: string;
  href: string;
}

/**
 * A configured link, or null.
 *
 * Anything that is not an https URL is treated as unset rather than rendered.
 * These values are typed into a settings page by hand, and a half-filled one
 * ("TBD", a bare domain, an empty string that survived a copy-paste) must not
 * become a broken button on the landing page.
 */
function link(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

const env = import.meta.env as Record<string, unknown>;

const IOS_APP_URL = link(env.VITE_IOS_APP_URL);
const ANDROID_APP_URL = link(env.VITE_ANDROID_APP_URL);
const DESKTOP_DOWNLOAD_URL = link(env.VITE_DESKTOP_DOWNLOAD_URL);

/** Every platform that can actually be installed today, in offer order. */
export const downloadTargets: readonly DownloadTarget[] = [
  IOS_APP_URL && {
    id: "ios" as const,
    label: "Download for iPhone",
    description: "iPhone and iPad, from the App Store.",
    href: IOS_APP_URL,
  },
  ANDROID_APP_URL && {
    id: "android" as const,
    label: "Get it on Google Play",
    description: "Android phones and tablets, from Google Play.",
    href: ANDROID_APP_URL,
  },
  DESKTOP_DOWNLOAD_URL && {
    id: "desktop" as const,
    label: "Download for desktop",
    description: "macOS, Windows and Linux.",
    href: DESKTOP_DOWNLOAD_URL,
  },
].filter((target): target is DownloadTarget => Boolean(target));

export function hasDownloads(): boolean {
  return downloadTargets.length > 0;
}

/**
 * The platform the visitor is most likely to want, judged from the user agent.
 *
 * Only ever used to put one option first — every target stays visible and
 * reachable, so a wrong guess costs nothing. That is also why this leans on
 * coarse, stable substrings rather than a parsing library: the failure mode is
 * a slightly less convenient page, not a wrong download.
 */
export function likelyPlatform(): PlatformId | null {
  if (typeof navigator === "undefined") return null;
  const agent = navigator.userAgent;
  if (/Android/i.test(agent)) return "android";
  // iPadOS reports itself as a Mac; a touch point is what separates them.
  if (/iPhone|iPod/i.test(agent)) return "ios";
  if (/iPad/i.test(agent)) return "ios";
  if (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1) return "ios";
  if (/Macintosh|Windows|Linux|CrOS/i.test(agent)) return "desktop";
  return null;
}

/** Available targets, most likely to be wanted first. */
export function orderedDownloadTargets(): readonly DownloadTarget[] {
  const preferred = likelyPlatform();
  if (!preferred) return downloadTargets;
  return [...downloadTargets].sort((a, b) =>
    a.id === preferred ? -1 : b.id === preferred ? 1 : 0,
  );
}

/**
 * @fileOverview Web domain role: resolves and applies the Light / Dark / System appearance choice.
 * System connection: written by Settings, read by the shells; the resolution
 * rule is pure so it is testable without a browser.
 */

export type AppearanceMode = "light" | "dark" | "system";

/** Where the choice is cached for the very first paint, before the API answers. */
export const APPEARANCE_KEY = "casparel_appearance";
const APPEARANCE_EVENT = "casparel-appearance-change";

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * The theme to paint, given the choice and what the device reports.
 *
 * "system" is the default because it is the only answer that is right before
 * anybody has expressed a preference: it follows the phone, which the person
 * has already set.
 */
export function resolveAppearance(
  mode: AppearanceMode | null | undefined,
  systemPrefersDark: boolean,
): "light" | "dark" {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return systemPrefersDark ? "dark" : "light";
}

export function readStoredAppearance(): AppearanceMode {
  try {
    const stored = localStorage.getItem(APPEARANCE_KEY);
    if (isAppearanceMode(stored)) return stored;
  } catch {
    // Storage blocked: follow the device, which is the safe default.
  }
  return "system";
}

export function storeAppearance(mode: AppearanceMode): void {
  try {
    localStorage.setItem(APPEARANCE_KEY, mode);
  } catch {
    // The account copy is authoritative; this is only the first-paint cache.
  }
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}

export function subscribeToAppearance(onChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === APPEARANCE_KEY) onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(APPEARANCE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(APPEARANCE_EVENT, onChange);
  };
}

/**
 * Paint the resolved theme on the document.
 *
 * The design system keys its dark tokens off a `.dark` class, and
 * `color-scheme` is what makes the browser's own surfaces — form controls,
 * scrollbars, the space behind an overscroll — match. Setting one without the
 * other produces a dark page with white scrollbars.
 */
export function applyAppearance(resolved: "light" | "dark"): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

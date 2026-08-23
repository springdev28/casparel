/**
 * @fileOverview Mobile support role: configures or implements Session Palette for the Expo application.
 * System connection: supports native build/runtime behavior and communication with the same API used by web and desktop.
 */
/**
 * The violet a study session is drawn in, in both colour schemes.
 *
 * Study sessions are told apart from ordinary schedule blocks by colour: a
 * violet card among plain ones. Every one of those violets was written into
 * the schedule screen as a literal -- `#f5f3ff` panels, `#7c3aed` buttons,
 * `#3b0764` titles -- chosen against a white page. The rest of the screen
 * reads its colours from the design system and follows the phone's setting, so
 * on a dark phone the schedule went dark and the study sessions did not: a
 * near-white panel on a black screen, which is what you notice at night and
 * roughly the brightest thing the app can do.
 *
 * The tokens already carry this colour -- `chart4` is `#7c3aed` in light and
 * `#a78bfa` in dark -- but a palette needs more than one shade, so the family
 * is spelled out here rather than derived. It is a plain function of the
 * scheme so the contrast can be checked without a phone; see
 * session-palette.test.ts, which measures every pair against WCAG AA.
 *
 * Two light values are not the ones that were there before. `#16a34a` behind
 * white "✓ Accept" measured 3.3:1 and `#dc2626` on its pink error box 4.4:1,
 * both under the 4.5:1 that ordinary text needs; they are now `#15803d` and
 * `#b91c1c`, the same hues a step darker.
 */

export type ColorScheme = "light" | "dark" | null | undefined;

export type SessionPalette = {
  /** The card behind a study session. */
  surface: string;
  /** The same card, held down. */
  surfacePressed: string;
  border: string;
  /** Solid fills: the primary button, the day dot, the card's left edge. */
  accent: string;
  /** Text and icons on `accent`. */
  onAccent: string;
  /** Accent-coloured text on `surface`. */
  accentText: string;
  /** A title on `surface`. */
  strongText: string;
  /** Solid fill for accepting. */
  positive: string;
  onPositive: string;
  /** "✓ Accepted" on `positiveSurface`. */
  positiveText: string;
  positiveSurface: string;
  /** An error, or "✗ Declined", on `negativeSurface`. */
  negativeText: string;
  negativeSurface: string;
};

const LIGHT: SessionPalette = {
  surface: "#f5f3ff",
  surfacePressed: "#ede9fe",
  border: "#c4b5fd",
  accent: "#7c3aed",
  onAccent: "#ffffff",
  accentText: "#6d28d9",
  strongText: "#3b0764",
  positive: "#15803d",
  onPositive: "#ffffff",
  positiveText: "#15803d",
  positiveSurface: "#f0fdf4",
  negativeText: "#b91c1c",
  negativeSurface: "#fef2f2",
};

const DARK: SessionPalette = {
  surface: "#241f38",
  surfacePressed: "#2e2747",
  border: "#4c3f7a",
  accent: "#a78bfa",
  onAccent: "#0f1117",
  accentText: "#c4b5fd",
  strongText: "#ede9e3",
  positive: "#34d399",
  onPositive: "#0f1117",
  positiveText: "#34d399",
  positiveSurface: "#10241c",
  negativeText: "#f87171",
  negativeSurface: "#2a1416",
};

export function sessionPalette(scheme: ColorScheme): SessionPalette {
  return scheme === "dark" ? DARK : LIGHT;
}

/**
 * @fileOverview Verification role: exercises Session Palette.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The study-session colours are readable, and dark mode is dark.
 *
 * The bug this exists to stop is not subtle: a `#f5f3ff` panel drawn on the
 * `#0f1117` background of a dark phone. It survived because colour is the one
 * thing a typechecker has nothing to say about and a screenshot is nobody's
 * unit test, so both halves are measured here -- a dark surface is actually
 * dark, and every text pair clears WCAG AA.
 *
 * The contrast maths is the WCAG 2.1 definition, written out rather than
 * imported: it is fifteen lines, and a dependency to check a dependency-free
 * palette is a poor trade.
 */
import { describe, expect, it } from "vitest";
import { sessionPalette, type SessionPalette } from "./session-palette";

/** The design system's page background, which these colours sit on. */
const PAGE = { light: "#f8f7f4", dark: "#0f1117" };

function channel(eightBit: number): number {
  const v = eightBit / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const r = channel(parseInt(value.slice(0, 2), 16));
  const g = channel(parseInt(value.slice(2, 4), 16));
  const b = channel(parseInt(value.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every text-on-background pair the schedule screen actually draws. */
function textPairs(p: SessionPalette): Array<[string, string, string]> {
  return [
    ["a session's title", p.strongText, p.surface],
    ["a session's time", p.accentText, p.surface],
    ["a session's title, pressed", p.strongText, p.surfacePressed],
    ["the collaborative badge", p.accentText, p.surfacePressed],
    ["the pending-invitations pill", p.accentText, p.surfacePressed],
    ["the accept button", p.onPositive, p.positive],
    ["an accepted participant", p.positiveText, p.positiveSurface],
    ["a declined participant", p.negativeText, p.negativeSurface],
    ["the form's error box", p.negativeText, p.negativeSurface],
    ["the join button", p.onAccent, p.accent],
    ["the new-session button", p.onAccent, p.accent],
  ];
}

describe.each(["light", "dark"] as const)("the %s study-session palette", (scheme) => {
  const palette = sessionPalette(scheme);

  it.each(textPairs(palette))("%s is readable", (_what, text, background) => {
    // 4.5:1 is AA for ordinary text. Every one of these is ordinary text:
    // the largest is 15px semibold, which is not large by the definition.
    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a session's card in the same world as the page", () => {
    // The failure, stated as a number: a panel must not be dramatically
    // brighter than the page it is on. Three stops of contrast between a card
    // and its background is a card that glows.
    const page = PAGE[scheme];
    for (const surface of [palette.surface, palette.surfacePressed, palette.positiveSurface, palette.negativeSurface]) {
      expect(contrast(surface, page), `${surface} against ${page}`).toBeLessThan(3);
    }
  });

  it("draws the accent strongly enough to see against the page", () => {
    // The left edge of a session card, the dot under a day, and the fill of
    // the primary button are all shapes rather than text: 3:1 is the bar.
    expect(contrast(palette.accent, PAGE[scheme])).toBeGreaterThanOrEqual(3);
  });
});

describe("choosing a palette", () => {
  it("gives a dark phone dark surfaces", () => {
    // The whole defect in one assertion.
    expect(luminance(sessionPalette("dark").surface)).toBeLessThan(
      luminance(sessionPalette("light").surface),
    );
    expect(luminance(sessionPalette("dark").surface)).toBeLessThan(0.05);
  });

  it("treats an unknown scheme as light, the way useColorScheme's null means", () => {
    expect(sessionPalette(null)).toEqual(sessionPalette("light"));
    expect(sessionPalette(undefined)).toEqual(sessionPalette("light"));
  });
});

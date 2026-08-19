/**
 * A phone screen does not paint a colour the phone's setting cannot change.
 *
 * The schedule screen drew study sessions in a violet family written straight
 * into the file -- `#f5f3ff` panels, `#7c3aed` buttons, `#3b0764` titles --
 * all chosen against a white page. Everything around them read the design
 * tokens and followed the phone, so on a dark phone the schedule went dark and
 * the study sessions stayed white: a near-white panel on a black screen, at
 * night, which is roughly the brightest thing the app can do. The profile
 * screen had the same shape in miniature, five `#fff` labels on
 * `colors.primary` -- fine on light's navy, 3:1 on dark's paler blue.
 *
 * Nothing catches this. A literal typechecks, renders, and screenshots
 * perfectly in whichever scheme the person looking happened to be in.
 *
 * So the rule is the check: colours come from `useColors()` (which reads the
 * scheme) or from `sessionPalette()` (which is given it and whose contrast is
 * measured in the mobile suite). The two literals that are genuinely
 * scheme-independent are allowed by name below.
 *
 * This lives in the api-server suite rather than the mobile one because the
 * mobile package has no Node types, and putting them in scope would hand
 * `process` and `Buffer` to code that runs on a phone.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), "../../../mobile");

/**
 * `shadowColor: '#000'` is a shadow, which is black in both schemes and is
 * softened by `shadowOpacity` rather than by hue. Transparent is a colour in
 * neither.
 */
const ALLOWED = [/shadowColor:\s*['"]#0{3,8}['"]/, /['"]transparent['"]/];

/** Where the colours are supposed to come from. */
const PALETTE_FILE = "utils/session-palette.ts";

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

describe("the mobile app's colours", () => {
  it("has screens that never hardcode one", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(join(mobile, "app")).concat(sourceFiles(join(mobile, "components")))) {
      const relative = file.slice(mobile.length + 1);
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (!/#[0-9a-fA-F]{3,8}\b/.test(line)) return;
          if (ALLOWED.some((pattern) => pattern.test(line))) return;
          offenders.push(`${relative}:${index + 1}  ${line.trim()}`);
        });
    }

    expect(
      offenders,
      "these draw the same colour on a light phone and a dark one; take them " +
        `from useColors() or sessionPalette() (see ${PALETTE_FILE})`,
    ).toEqual([]);
  });

  it("keeps the study-session palette somewhere its contrast is measured", () => {
    // The palette is allowed to hold literals -- it is the one place that
    // should. session-palette.test.ts measures every pair in it against WCAG
    // AA in both schemes, which is the whole reason it was worth extracting.
    const palette = readFileSync(join(mobile, PALETTE_FILE), "utf8");
    expect(palette).toMatch(/const DARK: SessionPalette/);
    expect(readFileSync(join(mobile, "utils/session-palette.test.ts"), "utf8")).toMatch(
      /toBeGreaterThanOrEqual\(4\.5\)/,
    );
  });
});

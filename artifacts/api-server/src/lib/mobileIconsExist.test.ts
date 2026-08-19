/**
 * Every icon the phone app asks for is one Feather actually has.
 *
 * `sparkles` is not a Feather icon -- it belongs to a different set -- and the
 * paywall asked for it on the middle row of all three plans. A missing glyph
 * is a valid character, so it rendered: a question mark in a grey square, on
 * the screen the whole subscription turns on. It typechecked, because the row
 * was `<Feather name={icon as never}>`; it bundled; and a screenshot of it is
 * only wrong if you happen to know what was meant.
 *
 * Those two call sites are typed against Feather's own glyph map now, so the
 * typechecker catches them. This covers the rest -- `<Empty icon="calendar">`
 * and anything else that passes a name through a `string` prop -- because the
 * next one will be somewhere neither of those two places is.
 *
 * It lives in the api-server suite because the mobile package has no Node
 * types, and adding them would put `process` and `Buffer` in scope for code
 * that runs on a phone.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mobile = resolve(here, "../../../mobile");
const eduDs = resolve(here, "../../../schoolar-edu/src/components/native");

const glyphs: Record<string, number> = createRequire(join(mobile, "package.json"))(
  "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Feather.json",
);

/**
 * Where a Feather name is written down.
 *
 * `<Feather name="x">` and `<Empty icon="x">` directly, and the icon fields of
 * the objects screens build to drive them. Route names in a navigator use the
 * same `name=` attribute, so `name=` only counts when Feather is the tag.
 */
const PATTERNS = [
  /<Feather\b[^>]*?\bname=["']([a-z][a-z0-9-]*)["']/g,
  /\bicon[:=]\s*["']([a-z][a-z0-9-]*)["']/g,
];

/**
 * The same names, when a branch chooses between them.
 *
 * `icon={isTeacher ? 'user-check' : 'star'}` is how the dashboard picks its
 * fourth tile, and the patterns above see none of it: the prop is followed by
 * a brace, not a quote. Two of the app's icons are written that way and both
 * were unchecked -- in a file whose whole job is to check them.
 *
 * Only the expression between the braces is read, so a `title=` or a class
 * name further along the line cannot be mistaken for a glyph.
 */
const BRACED = /\b(?:icon|name)=\{([^}]*)\}/g;
const QUOTED = /["']([a-z][a-z0-9-]*)["']/g;

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

/**
 * Names that are not Feather's to have.
 *
 * The tab layout also draws SF Symbols on iOS -- `sf={{ default: 'person.3' }}`
 * -- which are a different set entirely and are told apart by the dot.
 */
const NOT_FEATHER = (name: string) => name.includes(".");

describe("the phone app's icons", () => {
  it("all exist in Feather", () => {
    const roots = [join(mobile, "app"), join(mobile, "components"), eduDs];
    const missing: string[] = [];

    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        const source = readFileSync(file, "utf8");
        source.split("\n").forEach((line, index) => {
          const found: string[] = [];
          for (const pattern of PATTERNS) {
            for (const match of line.matchAll(pattern)) found.push(match[1]);
          }
          // Only on a line that is drawing a Feather: `name={...}` is also how
          // a navigator names a route, and a route is not a glyph.
          if (/<Feather\b|\bicon=\{/.test(line)) {
            for (const braced of line.matchAll(BRACED)) {
              for (const quoted of braced[1].matchAll(QUOTED)) found.push(quoted[1]);
            }
          }
          for (const name of found) {
            if (NOT_FEATHER(name) || name in glyphs) continue;
            missing.push(`${file.slice(mobile.length + 1)}:${index + 1}  ${name}`);
          }
        });
      }
    }

    expect(
      missing,
      "Feather draws a missing glyph as a question mark, which renders " +
        "perfectly and means nothing",
    ).toEqual([]);
  });

  it("is reading a real glyph map", () => {
    // If the map ever resolved to something empty this file would pass by
    // knowing nothing, which is the failure mode it exists to prevent.
    expect(Object.keys(glyphs).length).toBeGreaterThan(200);
    expect(glyphs).toHaveProperty("zap");
    expect(glyphs).not.toHaveProperty("sparkles");
  });
});

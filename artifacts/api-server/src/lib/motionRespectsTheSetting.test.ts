/**
 * @fileOverview Verification role: exercises Motion Respects The Setting.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Nothing on the phone animates for a fixed number of milliseconds.
 *
 * Reduce Motion is not a preference about decoration. For some people motion
 * causes nausea or migraine, and an app that ignores the setting is one they
 * close. `MotionContext` reads it, `durationForMotion` turns it into a
 * duration of zero, and both have been tested since before this file existed.
 *
 * Neither was used where the app actually animates. Onboarding and the paywall
 * held seven staggered fade-ins between them, every one written as
 * `.duration(450)` or `.duration(500)` with a hand-written delay, and none of
 * them asked what the reader had turned on. The tokens were right, the helper
 * was right, and the screens went their own way.
 *
 * So this reads the screens. A literal duration or delay is the shape of an
 * animation that cannot be turned off, whatever is in the file above it, and
 * that is what fails here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../mobile",
);

/** Every screen and component that could animate. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) return [];
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const files = [
  ...sources(join(appRoot, "app")),
  ...sources(join(appRoot, "components")),
].map((path) => ({
  where: relative(appRoot, path),
  text: readFileSync(path, "utf8"),
}));

/**
 * `.duration(450)` or `.delay(120)` — a number written into an animation.
 *
 * A value from the motion context reads `.duration(timing.duration)` and does
 * not match, which is the distinction: the number is the problem, not the
 * call. `.delay(0)` is allowed, because zero is what Reduce Motion asks for
 * and writing it plainly is clearer than routing it through a helper.
 */
const FIXED_TIMING = /\.(duration|delay)\(\s*[1-9]\d*\s*\)/g;

describe("the phone app's animations", () => {
  it("has screens to check", () => {
    // A moved directory would empty this list and pass the rule below while
    // checking nothing.
    expect(files.length).toBeGreaterThan(20);
    expect(files.some(({ text }) => text.includes("react-native-reanimated"))).toBe(true);
  });

  it("never animates for a fixed length of time", () => {
    const fixed = files.flatMap(({ where, text }) =>
      [...text.matchAll(FIXED_TIMING)].map(
        (match) =>
          `${where}:${text.slice(0, match.index).split("\n").length}  ${match[0]}`,
      ),
    );
    expect(
      fixed,
      "these run for the same length of time whatever the reader has asked " +
        "for; take the duration and the delay from useMotion / entranceTiming",
    ).toEqual([]);
  });
});

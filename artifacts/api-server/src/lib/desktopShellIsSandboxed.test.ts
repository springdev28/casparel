/**
 * The desktop shell keeps all three of its locks, not just enough of them.
 *
 * The shell is an Electron window around remote content: it loads
 * casparel.com and has no preload bridge, so its entire security posture is
 * that the page it renders cannot reach the machine it renders on. Three
 * settings hold that line -- `sandbox: true`, `contextIsolation: true`,
 * `nodeIntegration: false` -- and any one of them is enough on its own.
 *
 * That redundancy is the problem this file exists for. The smoke run asks the
 * loaded page whether it can reach Node, which is the outcome that matters and
 * is measured in a real Electron window; but because the three overlap, it
 * only fails when all three are wrong at once. Verified: with `sandbox: true`
 * left alone, turning `nodeIntegration` on and `contextIsolation` off changed
 * nothing the page could see, and the smoke run passed.
 *
 * So a commit could remove two of the three and nothing anywhere would say so
 * -- until the day somebody touched the third for an unrelated reason and
 * turned a small edit into remote code execution on every desktop install.
 *
 * This reads the declaration. Between the two, one covers what was asked for
 * and the other covers what was got, which is what it takes for a setting
 * whose failure is silent until it is catastrophic.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const main = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../desktop/src/main.ts",
);
const source = readFileSync(main, "utf8");

/** The block the BrowserWindow is actually constructed with. */
const webPreferences = (() => {
  const at = source.indexOf("webPreferences: {");
  if (at < 0) return "";
  return source.slice(at, source.indexOf("}", at));
})();

describe("the desktop shell's window", () => {
  it("declares a webPreferences block at all", () => {
    // Electron's defaults are safe in current versions, but "safe by default"
    // is a thing to state rather than to inherit quietly: this file is the
    // record of a decision.
    expect(webPreferences, `no webPreferences found in ${main}`).not.toBe("");
  });

  it.each([
    ["sandbox", "true"],
    ["contextIsolation", "true"],
    ["nodeIntegration", "false"],
  ])("keeps %s at %s", (setting, value) => {
    expect(
      webPreferences,
      `${setting} is the shell's protection against the page it loads; the ` +
        `other two settings will hide its absence from the smoke run`,
    ).toMatch(new RegExp(`\\b${setting}:\\s*${value}\\b`));
  });

  it("does not turn off the protections Electron gives for free", () => {
    for (const dangerous of [
      /webSecurity:\s*false/,
      /allowRunningInsecureContent:\s*true/,
      /webviewTag:\s*true/,
      /experimentalFeatures:\s*true/,
    ]) {
      expect(source, `${dangerous} in the desktop shell`).not.toMatch(dangerous);
    }
  });

  it("has no preload bridge for the page to call into", () => {
    // The shell deliberately talks to the page one way only, through a
    // user-agent suffix. A preload would be a channel in the other direction,
    // and every argument above assumes there is not one.
    expect(source).not.toMatch(/preload:/);
  });
});

/**
 * @fileOverview Verification role: exercises Dashboard Greeting.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The dashboard header may not claim things that did not happen.
 *
 * It used to greet everyone with "Welcome back" and tell them "Your path
 * adapted after yesterday's reflection. Here's the best next step." Both were
 * hardcoded and unconditional, so an account ten seconds old was told it had
 * been here before and that its path had adapted after a reflection it had
 * never made -- on the same screen that said, a little lower down, "Your path
 * is empty. Create a goal to build your first checklist."
 *
 * The greeting is also a translation trap. UiTranslationBridge rewrites exact
 * whole strings, so the obvious repair -- one sentence with the day
 * interpolated, `after ${when}'s reflection` -- would have read correctly in
 * English and shown English to every reader of the other five languages,
 * because an interpolated string can never match a dictionary key. So the
 * branches are whole sentences, and this file checks each one is translated
 * everywhere rather than trusting that whoever adds the next branch remembers.
 *
 * Read as text on purpose: the point is what a reader of these files sees.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appSrc = resolve(dirname(fileURLToPath(import.meta.url)), "../../../app/src");
const dashboard = readFileSync(
  resolve(appSrc, "pages/AdaptiveDashboardPage.tsx"),
  "utf8",
);

const dictionaryDir = resolve(appSrc, "lib/ui-translations");
const languages = readdirSync(dictionaryDir)
  .filter((name) => name.endsWith(".ts") && name !== "index.ts")
  .map((name) => ({
    language: name.replace(/\.ts$/, ""),
    text: readFileSync(resolve(dictionaryDir, name), "utf8"),
  }));

/** The whole-sentence literals the header can show. */
function subtitleSentences(): string[] {
  const start = dashboard.indexOf("const journeySubtitle");
  expect(start, "journeySubtitle is gone from the dashboard").toBeGreaterThan(-1);
  const body = dashboard.slice(start, dashboard.indexOf("\n  })();", start));
  return [...body.matchAll(/"((?:[^"\\]|\\.)+)"/g)]
    .map((match) => match[1].replace(/\\"/g, '"'))
    .filter((sentence) => sentence.length > 20);
}

describe("the dashboard header tells the truth", () => {
  const sentences = subtitleSentences();

  it("finds the sentences to check", () => {
    // A rename that stopped this matching would make every assertion below
    // vacuous, which is the failure this file exists to catch.
    expect(sentences.length).toBeGreaterThanOrEqual(4);
  });

  it("does not claim a reflection happened yesterday come what may", () => {
    // The exact shape of the old bug: the sentence present in the markup with
    // nothing deciding whether it applies.
    const header = dashboard.slice(dashboard.indexOf("YOUR LEARNING JOURNEY"));
    expect(header.slice(0, 600)).not.toMatch(
      /Your path adapted after yesterday/,
    );
  });

  it("only says welcome back to someone who has been back", () => {
    expect(dashboard).toContain('hasReflected ? "Welcome back" : "Welcome"');
  });

  it("waits for the answer before describing the history", () => {
    const start = dashboard.indexOf("const journeySubtitle");
    const body = dashboard.slice(start, dashboard.indexOf("\n  })();", start));
    expect(body).toMatch(/evidenceLoading \|\| evidence === undefined/);
  });

  it.each(sentences)("translates %s", (sentence) => {
    const missing = languages
      .filter(({ text }) => !text.includes(`"${sentence.replace(/"/g, '\\"')}":`))
      .map(({ language }) => language);
    expect(
      missing,
      `no translation of "${sentence}" in ${missing.join(", ")}, so those readers see it in English`,
    ).toEqual([]);
  });
});

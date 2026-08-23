/**
 * @fileOverview Verification role: exercises One List Of Languages.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * The languages a client offers are the languages the server accepts.
 *
 * Six lists have to agree for a language to work end to end, and they are
 * maintained by hand in six different files:
 *
 *   1. the web's picker            app/src/lib/auth-locale.ts
 *   2. the phone's picker          mobile/lib/i18n/index.ts
 *   3. the server's enum           api-server/src/routes/auth.ts
 *   4. the catalogue's enum        lib/api-spec/openapi.yaml
 *   5. the web's dictionaries      app/src/lib/ui-translations/
 *   6. the phone's dictionaries    mobile/lib/i18n/
 *
 * A picker that offers more than the server accepts is the bad direction and
 * it fails silently in the worst place: somebody chooses their language, the
 * PATCH is rejected by a zod enum, and the only thing they see is that the
 * choice did not stick. Nothing logs, nothing shows an error, and it looks
 * like the setting is broken rather than the language.
 *
 * The reverse is harmless -- a server may accept a language no client offers
 * yet -- so it is reported rather than failed.
 *
 * Two of the six pairings are already held elsewhere and are not repeated:
 * datesFollowTheLanguage.test.ts pins the web picker against date-locale's
 * two tables, and mobileSpeaksItsLanguages.test.ts pins the phone's
 * dictionaries and its CFBundleLocalizations. This file is the part nobody
 * was checking: whether the two clients and the server agree at all.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");

const read = (relative: string) => readFileSync(resolve(repo, relative), "utf8");

/** `{ code: "es", … }` entries, which is how both pickers are written. */
function pickerCodes(source: string): string[] {
  return [...source.matchAll(/\{\s*code:\s*"(\w+)"/g)].map((match) => match[1]);
}

const webPicker = pickerCodes(read("artifacts/app/src/lib/auth-locale.ts"));
const phonePicker = pickerCodes(read("artifacts/mobile/lib/i18n/index.ts"));

/** The enum the preferences endpoint validates against. */
const serverEnum = (() => {
  const auth = read("artifacts/api-server/src/routes/auth.ts");
  const match = /language:\s*z\.enum\(\[([^\]]+)\]\)/.exec(auth);
  return (match?.[1] ?? "")
    .split(",")
    .map((value) => value.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
})();

/**
 * The catalogue's search enum, which carries an extra `any`.
 *
 * "any" is not a language, it is the absence of a filter -- so it is dropped
 * here rather than added to every other list to make the comparison work.
 */
const catalogueEnum = (() => {
  const spec = read("lib/api-spec/openapi.yaml");
  const match = /enum:\s*\[any,\s*([^\]]+)\]/.exec(spec);
  return (match?.[1] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
})();

/** One dictionary module per language, plus the index that wires them up. */
const webDictionaries = readdirSync(
  resolve(repo, "artifacts/app/src/lib/ui-translations"),
)
  .filter((name) => name.endsWith(".ts") && name !== "index.ts")
  .map((name) => name.replace(/\.ts$/, ""));

describe("the languages Casparel offers", () => {
  it("found all four lists", () => {
    // Any of these coming back empty would make the comparisons below compare
    // nothing and pass, which is the failure mode this file exists to catch
    // in the product.
    expect(webPicker.length, "web picker").toBeGreaterThanOrEqual(2);
    expect(phonePicker.length, "phone picker").toBeGreaterThanOrEqual(2);
    expect(serverEnum.length, "server enum in routes/auth.ts").toBeGreaterThanOrEqual(2);
    expect(catalogueEnum.length, "catalogue enum in openapi.yaml").toBeGreaterThanOrEqual(2);
  });

  it("offers the same languages on the web and on the phone", () => {
    expect(
      [...phonePicker].sort(),
      "the two pickers disagree, so the same account offers different " +
        "languages depending on which client it is opened in",
    ).toEqual([...webPicker].sort());
  });

  it.each([
    ["the web picker", () => webPicker],
    ["the phone picker", () => phonePicker],
  ])("never lets %s offer a language the server will reject", (_label, get) => {
    const rejected = get().filter((code) => !serverEnum.includes(code));
    expect(
      rejected,
      "the preferences endpoint validates against a zod enum, so choosing " +
        "one of these is a rejected PATCH: no error is shown and the setting " +
        "simply does not stick",
    ).toEqual([]);
  });

  it("searches the catalogue in every language it renders itself in", () => {
    // The other direction of the same promise: an app that speaks Turkish and
    // cannot filter the catalogue for Turkish material is only half localised.
    const unsearchable = webPicker.filter((code) => !catalogueEnum.includes(code));
    expect(unsearchable, "missing from the discover enum in openapi.yaml").toEqual([]);
  });

  it("has a dictionary for every language but English", () => {
    const expected = webPicker.filter((code) => code !== "en").sort();
    expect(
      [...webDictionaries].sort(),
      "a language in the picker with no dictionary renders the whole " +
        "signed-in product in English while claiming otherwise",
    ).toEqual(expected);
  });

  it("says so when the server accepts more than anyone offers", () => {
    /*
     * Harmless, and worth naming. A server that accepts a language no client
     * offers is how a language gets added -- but it is also how one gets
     * half-removed, and the leftover is invisible from the outside.
     */
    const unoffered = serverEnum.filter(
      (code) => !webPicker.includes(code) && !phonePicker.includes(code),
    );
    if (unoffered.length) {
      console.warn(
        `The server accepts ${unoffered.join(", ")}, which no client offers. ` +
          `Not a failure: either a language on the way in, or one left behind.`,
      );
    }
    expect(Array.isArray(unoffered)).toBe(true);
  });
});

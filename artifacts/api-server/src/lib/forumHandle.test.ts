/**
 * The forum names its communities to a reader, not to the database.
 *
 * Every post carried a handle above it, and both forms were wrong. A post in
 * the open forum said "c/schoolar" -- the product's previous name, printed on
 * every post on the busiest shared page in the product. A post in a class said
 * "c/class-7": the row id of the class, shown to the pupils who are in it, who
 * know it as Physics 10B and have no idea what 7 is.
 *
 * The class name comes from the list of classes the reader belongs to, so the
 * id remains as a fallback for somebody reading a class forum they are not a
 * member of. That fallback is the reason this test checks for the *literal*
 * old shapes rather than the absence of "class-": one is a defect and the
 * other is the honest answer to "I cannot name this class".
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const forumPage = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/src/pages/ForumPage.tsx",
  ),
  "utf8",
);

/** The file with its comments removed: prose about a bug is not the bug. */
const code = forumPage
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("the forum's community handle", () => {
  it("reads the file it is about", () => {
    expect(code).toContain("c/casparel");
  });

  it("never shows the product's old name", () => {
    // Only as a handle a reader sees. The session key in localStorage is
    // called schoolar_token and renaming that would sign everybody out, so
    // the old name survives in storage keys on purpose.
    expect(
      code.includes('"c/schoolar"') || code.includes("`c/schoolar`"),
      "the product is Casparel; this was on every post in the open forum",
    ).toBe(false);
  });

  it("names a class rather than numbering it", () => {
    expect(code).toContain("classForumName");
    expect(
      code,
      "the id may only appear as the fallback for a class the reader is not in",
    ).not.toMatch(/\bc\/class-\$\{classId\}`\s*:/);
  });

  it("does not translate a class's own name", () => {
    // The handle is a name once a class is resolved, and names are not copy.
    expect(code).toMatch(/translate=\{classId \? "no" : undefined\}/);
  });
});

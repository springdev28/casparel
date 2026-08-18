/**
 * Deleting an account has to reach the copies of your name, not just the row.
 *
 * The users row is anonymised on delete: address, name, bio, subjects, the
 * lot. But six other tables keep a denormalised copy of the name, written at
 * the time you posted so that a listing does not have to join users. None of
 * them were touched. The row said "Deleted user" while the forum went on
 * showing the person's real name on every post and comment they had written,
 * publicly, for good.
 *
 * The response was 204 either way. It was only visible by deleting an account
 * and then looking at the database.
 *
 * This file is written against the schema rather than against the handler, so
 * it fails for the table that does not exist yet. Someone adding an
 * `authorName` to a new table gets a failing test naming their column, instead
 * of quietly reintroducing this in a place nobody thinks to check.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const auth = readFileSync(resolve(here, "../routes/auth.ts"), "utf8");
const schemaDir = resolve(here, "../../../../lib/db/src/schema");

/**
 * Columns that hold a person's name copied from users.
 *
 * Matched by shape: a `somethingName` text column. The exclusions are columns
 * that carry a name of something that is not a person -- a file, a topic --
 * and so are not identifying.
 *
 * The test is applied to the last word of the prefix, not the whole of it:
 * `attachmentFileName` is a file, and checking the prefix entire let it
 * through as if it were somebody called Attachment File.
 */
const NOT_A_PERSON = /^(file|topic|list|display|table|class|column|template)$/i;

function lastWord(prefix: string): string {
  const words = prefix.split(/(?=[A-Z])/);
  return words[words.length - 1] ?? prefix;
}

function nameColumns(): Array<{ file: string; column: string }> {
  const found: Array<{ file: string; column: string }> = [];
  for (const file of readdirSync(schemaDir).filter((n) => n.endsWith(".ts"))) {
    const text = readFileSync(resolve(schemaDir, file), "utf8");
    for (const match of text.matchAll(/(\w+)Name:\s*text\(/g)) {
      const prefix = match[1];
      if (NOT_A_PERSON.test(lastWord(prefix))) continue;
      found.push({ file, column: `${prefix}Name` });
    }
  }
  return found;
}

/** The delete handler's list of copies to overwrite. */
function handledColumns(): string[] {
  const start = auth.indexOf("const NAME_COPIES");
  expect(start, "NAME_COPIES is gone from the delete handler").toBeGreaterThan(-1);
  const body = auth.slice(start, auth.indexOf("] as const;", start));
  return [...body.matchAll(/"(\w+Name)"/g)].map((m) => m[1]);
}

describe("deleting an account reaches every copy of the name", () => {
  const columns = nameColumns();

  it("finds the copies to check", () => {
    // A schema move or a renamed pattern would make every assertion below
    // vacuous, which is the failure this file exists to catch.
    expect(columns.length).toBeGreaterThanOrEqual(5);
  });

  it("overwrites the users row itself", () => {
    expect(auth).toContain("name: DELETED_USER_NAME");
  });

  it.each(columns.map((c) => [`${c.file}:${c.column}`, c.column]))(
    "overwrites %s",
    (_label, column) => {
      expect(
        handledColumns(),
        `${column} keeps a copy of the name that deleting an account never clears`,
      ).toContain(column);
    },
  );

  it("clears them to the same name the users row gets", () => {
    // Two different strings would be a way to tell a deleted account's posts
    // apart from the account, which is most of what anonymising is for.
    const start = auth.indexOf("for (const [table, ownerColumn, nameColumn]");
    expect(start).toBeGreaterThan(-1);
    expect(auth.slice(start, start + 400)).toContain(
      "[nameColumn]: DELETED_USER_NAME",
    );
  });
});

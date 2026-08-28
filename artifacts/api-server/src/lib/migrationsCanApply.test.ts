/**
 * @fileOverview Verification role: exercises Migrations Can Apply.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
/**
 * Every migration in the journal can actually be applied.
 *
 * Drizzle's migrator decides what is outstanding by comparing each journal
 * entry's `when` against the timestamp of the last migration recorded in the
 * database. An entry stamped earlier than the one before it is therefore
 * treated as already applied and skipped -- silently, with the runner
 * reporting success and the column simply not being there.
 *
 * That is not hypothetical: it happened while adding `learning_goals
 * .source_list_id`. `drizzle-kit generate` stamps the wall clock, and this
 * repository's journal carries timestamps some weeks ahead of it, so the new
 * entry sorted behind the previous one. Migrations "ran", the table was
 * unchanged, and the first query against the new column returned a 500 --
 * which is exactly the failure AGENTS.md warns about, arriving through a route
 * nobody would think to check.
 *
 * So the two things the migrator needs are checked here, where they cost
 * nothing: the order it reads, and that every entry has a file to read.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const migrations = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../lib/db/migrations",
);

type Entry = { idx: number; when: number; tag: string };

const journal = JSON.parse(
  readFileSync(join(migrations, "meta/_journal.json"), "utf8"),
) as { entries: Entry[] };

describe("the migration journal", () => {
  it("has entries, so an empty pass is not a pass", () => {
    expect(journal.entries.length).toBeGreaterThan(40);
  });

  it("is stamped in the order it is meant to run", () => {
    const backwards = journal.entries
      .map((entry, index) => ({ entry, previous: journal.entries[index - 1] }))
      .filter(({ entry, previous }) => previous && entry.when <= previous.when)
      .map(
        ({ entry, previous }) =>
          `${entry.tag} (${entry.when}) is not after ${previous.tag} (${previous.when})`,
      );

    expect(
      backwards,
      "drizzle skips a migration whose `when` is not greater than the last " +
        "one applied, and reports success while doing it. `drizzle-kit " +
        "generate` stamps the wall clock, so a hand-authored entry has to be " +
        "renumbered past the entry before it",
    ).toEqual([]);
  });

  it("names a file for every entry, and an entry for every file", () => {
    const missing = journal.entries
      .filter((entry) => !existsSync(join(migrations, `${entry.tag}.sql`)))
      .map((entry) => entry.tag);
    expect(missing, "these journal entries have no SQL file").toEqual([]);

    const listed = new Set(journal.entries.map((entry) => entry.tag));
    const orphans = readdirSync(migrations)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.replace(/\.sql$/, ""))
      .filter((tag) => !listed.has(tag));
    expect(
      orphans,
      "these SQL files are in the folder and not in the journal, so nothing " +
        "will ever run them",
    ).toEqual([]);
  });
});

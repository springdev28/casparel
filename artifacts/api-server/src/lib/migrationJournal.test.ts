/**
 * @fileOverview Verification role: exercises Migration Journal.Test behavior and guards its user-visible or system invariant.
 * System connection: runs in the package test/audit pipeline and should describe behavior, not implementation details.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guards the one migration failure that is completely silent.
 *
 * Drizzle applies a migration only when its journal `when` timestamp is greater
 * than the newest one already applied. The timestamp comes from the clock of
 * whoever ran drizzle-kit, so a machine running ahead stamps a migration in the
 * future, and every migration generated afterwards on a correct clock sorts
 * *before* it and is skipped. Nothing errors: the migrator reports success, the
 * health check reports ready, and the columns simply never exist. It surfaces
 * much later as 500s from whichever query touches them.
 *
 * That is exactly what happened with 0041/0042 (stamped 2026-09-13 and -14) and
 * 0043/0044 (stamped 2026-08-14): both new migrations were skipped in
 * production, taking out /users/me/usage and every resources query.
 *
 * A strictly increasing journal is the invariant that prevents it, so it is
 * asserted here rather than discovered in production.
 */

const journalPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../lib/db/migrations/meta/_journal.json",
);

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

function readJournal(): JournalEntry[] {
  const raw = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries: JournalEntry[];
  };
  return raw.entries;
}

describe("migration journal", () => {
  it("is present and non-empty", () => {
    expect(readJournal().length).toBeGreaterThan(0);
  });

  it("has strictly increasing timestamps, so no migration can be skipped", () => {
    const entries = readJournal();
    const outOfOrder = entries
      .map((entry, index) => ({ entry, previous: entries[index - 1] }))
      .filter(({ entry, previous }) => previous && entry.when <= previous.when)
      .map(
        ({ entry, previous }) =>
          `${entry.tag} (${entry.when}) does not come after ${previous.tag} (${previous.when})`,
      );

    expect(
      outOfOrder,
      "A migration whose timestamp is not after the previous one will never be " +
        "applied. Raise the `when` value in lib/db/migrations/meta/_journal.json " +
        "above the entry before it.",
    ).toEqual([]);
  });

  it("indexes every entry in order, with a matching SQL file", () => {
    const entries = readJournal();
    const migrationsDir = path.dirname(path.dirname(journalPath));
    entries.forEach((entry, index) => {
      expect(entry.idx).toBe(index);
      expect(
        fs.existsSync(path.join(migrationsDir, `${entry.tag}.sql`)),
        `${entry.tag}.sql is missing`,
      ).toBe(true);
    });
  });
});

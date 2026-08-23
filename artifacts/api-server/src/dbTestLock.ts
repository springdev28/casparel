/**
 * @fileOverview API support role: configures or operates the Db Test Lock part of the backend package.
 * System connection: participates in the API package's development, build, validation, or deployment lifecycle.
 */
/**
 * One database test file at a time.
 *
 * Every *.db.test.ts file empties the tables it is about to seed, because a
 * suite that asserts "search returns two results" needs to know what is in
 * there. Vitest runs separate files in parallel workers, so pointed at one
 * database they interleave: file A truncates, file B truncates and seeds, file
 * A inserts and collides on a primary key that was free a moment ago.
 *
 * That is not hypothetical. Running the two existing files together fails on
 * `duplicate key value violates unique constraint "users_pkey"` inside a
 * fixture — a failure that reads like a product defect and is not one. The
 * quieter version is worse: when the race lands the other way a suite asserts
 * against another file's fixtures and passes for the wrong reason.
 *
 * searchAgainstDatabase.db.test.ts already met this and solved it by keeping
 * its three suites in one file. That does not scale to separate concerns, so
 * the ordering moves into the database itself: a session-level advisory lock,
 * held for the whole file. It needs no second database and no privileges, and
 * it cannot leak — Postgres drops a session lock when the connection goes, so a
 * killed worker frees it rather than wedging the next run.
 *
 * Waiting is bounded and reported. A blocking `pg_advisory_lock` would hang the
 * run with no clue why, the same trap that sat in the migration runner.
 *
 * Holding the lock is only half of it. A file that tidies up on the way in and
 * not on the way out still leaves its rows for whoever runs next, and the next
 * file's own reset is written for the tables it seeds rather than for everything
 * pointing at them: deleting users failed on a resource_lists row the other file
 * had left owned by user 1. So the lock comes with an empty database, and no
 * file has to know what any other file inserts.
 */
import { afterAll, beforeAll } from "vitest";

/** Hashed to a lock id by Postgres; shared by every db test file. */
const LOCK_NAME = "casparel:db-test";

/** Generous: it only has to outlast the other files, which run in seconds. */
const LOCK_TIMEOUT_MS = 120_000;
const RETRY_MS = 100;

/**
 * Emptied before each file runs. `cascade` reaches everything referencing
 * these, which is why the header tells you to point at a throwaway database;
 * `restart identity` keeps the fixtures that pin literal ids honest.
 */
const OWNED_TABLES = [
  "list_items",
  "resource_lists",
  "catalog_resources",
  "resources",
  "users",
];

/**
 * Take the database to yourself, empty, for the duration of this file.
 *
 * Call once at module top level. Does nothing when no database is configured,
 * which is the CI case where every suite in the file skips anyway.
 */
export function useExclusiveDatabase(): void {
  const url = process.env.VERIFY_DATABASE_URL;
  if (!url) return;

  let release: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const db = await import("@workspace/db");
    const client = await db.pool.connect();

    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
      const result = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
        [LOCK_NAME],
      );
      if (result.rows[0]?.locked) break;
      if (Date.now() >= deadline) {
        client.release();
        throw new Error(
          `Timed out after ${LOCK_TIMEOUT_MS}ms waiting for another database ` +
            `test file to finish. If nothing else is running, a previous run ` +
            `may still hold a connection to ${url}.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }

    release = async () => {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_NAME]);
      client.release();
    };

    // The tables have to exist before they can be emptied, and the suites run
    // their own migrations after this hook. Migrating is idempotent, and takes
    // a different lock of its own.
    await db.runMigrations();
    await client.query(
      `truncate ${OWNED_TABLES.join(", ")} restart identity cascade`,
    );
  }, LOCK_TIMEOUT_MS + 30_000);

  afterAll(async () => {
    await release?.();
    release = undefined;
  });
}

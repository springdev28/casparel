import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "url";
import { sslForConnectionString } from "./ssl";

const { Pool } = pg;
const MIGRATION_LOCK_NAME = "schoolar:database-migrations";

/**
 * How long to keep trying for the migration lock before giving up.
 *
 * Migrations that have already been applied are skipped, so a normal startup
 * holds this lock for well under a second. Waiting half a minute means the
 * holder is not making progress, and continuing to wait is strictly worse than
 * failing: see acquireMigrationLock.
 */
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_RETRY_MS = 250;
/** A hung TCP/TLS handshake must not become an unbounded wait either. */
const CONNECT_TIMEOUT_MS = 15_000;

/**
 * Take the migration lock, or give up.
 *
 * This used to call pg_advisory_lock, which is the BLOCKING variant: it waits
 * for the lock forever, with no timeout and no cancellation. That turned a
 * contended lock into an unrecoverable outage. Startup awaits migrations before
 * it opens the HTTP port, so a process that blocked here never began listening,
 * and the host's process manager answered every request with 503 indefinitely.
 * Nothing recovered it, because a hang is not an error: the catch around
 * startup never ran, and no timeout existed to trip. Deploying twice in quick
 * succession is enough to reach it, when the outgoing process still holds the
 * session lock as the incoming one boots.
 *
 * pg_try_advisory_lock returns immediately instead, so polling it gives us a
 * deadline we control. Failing to acquire is then a normal error, which startup
 * already knows how to survive: it serves with a possibly stale schema and says
 * so through GET /healthz, rather than never starting at all.
 */
async function acquireMigrationLock(client: pg.PoolClient): Promise<void> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [MIGRATION_LOCK_NAME],
    );
    if (result.rows[0]?.locked) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${LOCK_TIMEOUT_MS}ms waiting for the database migration lock. ` +
          `Another process is holding it and not finishing; the schema may be behind the code.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
  }
}

/**
 * Applies all pending Drizzle migrations.
 * Uses a dedicated short-lived pool so the main app pool is unaffected.
 * Safe to call on every startup - already-applied migrations are skipped.
 *
 * Path resolution handles two execution contexts:
 *   Bundled  (artifacts/api-server/dist/index.mjs)
 *     -> __dirname = .../dist/
 *     -> "migrations"  resolves to .../dist/migrations  (build.mjs copies lib/db/migrations there)
 *   Source   (lib/db/src/migrate.ts run via tsx/ts-node)
 *     -> __dirname = .../lib/db/src/
 *     -> "migrations"  = .../lib/db/src/migrations  (does not exist)
 *     -> "../migrations" = .../lib/db/migrations
 *
 * We try the sibling "migrations" directory first (bundled) and fall back to
 * the parent-level "../migrations" directory (source).
 */
export async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set before running migrations");
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const primary = path.resolve(__dirname, "migrations");
  const fallback = path.resolve(__dirname, "../migrations");
  const migrationsFolder = fs.existsSync(primary) ? primary : fallback;
  const connectionString = process.env.DATABASE_URL.trim();
  const ssl = sslForConnectionString(connectionString);

  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    ...(ssl ? { ssl } : {}),
  });
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    // Login recovery and startup can request migrations at the same time. A
    // session advisory lock serializes them across every running app process.
    // Bounded, so a peer that never releases it cannot wedge this process.
    await acquireMigrationLock(client);
    lockAcquired = true;

    const db = drizzle(client);

    // PostgreSQL cannot use a newly added enum value until the transaction that
    // added it commits. Drizzle runs pending migrations in one transaction, so
    // prepare and commit this enum change before migration 0016 uses the type.
    const roleType = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1
          FROM pg_type
          JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
         WHERE pg_namespace.nspname = 'public'
           AND pg_type.typname = 'user_role'
      ) AS exists
    `);
    if (!roleType.rows[0]?.exists) {
      await client.query(
        `CREATE TYPE "public"."user_role" AS ENUM ('student', 'teacher')`,
      );
    }
    await client.query(
      `ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'admin'`,
    );

    await migrate(db, { migrationsFolder });
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
          MIGRATION_LOCK_NAME,
        ]);
      } catch {
        // Closing the connection releases the lock if the unlock query fails.
      }
    }
    client.release();
    await pool.end();
  }
}

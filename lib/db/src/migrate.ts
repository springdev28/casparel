import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "url";

const { Pool } = pg;

/**
 * Applies all pending Drizzle migrations.
 * Uses a dedicated short-lived pool so the main app pool is unaffected.
 * Safe to call on every startup — already-applied migrations are skipped.
 *
 * Path resolution handles two execution contexts:
 *   Bundled  (artifacts/api-server/dist/index.mjs)
 *     → __dirname = .../dist/
 *     → "migrations"  resolves to .../dist/migrations  (build.mjs copies lib/db/migrations there) ✓
 *   Source   (lib/db/src/migrate.ts run via tsx/ts-node)
 *     → __dirname = .../lib/db/src/
 *     → "migrations"  = .../lib/db/src/migrations  (does not exist)
 *     → "../migrations" = .../lib/db/migrations                                                 ✓
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

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

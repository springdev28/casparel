import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

/**
 * Applies all pending Drizzle migrations.
 * Uses a dedicated short-lived pool so the main app pool is unaffected.
 * Safe to call on every startup — already-applied migrations are skipped.
 *
 * The migrations folder must be co-located next to this file (or its
 * bundled equivalent).  The build step copies lib/db/migrations → dist/migrations
 * so the relative path `../migrations` resolves correctly both in source and
 * in the esbuild output.
 */
export async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set before running migrations");
  }

  // `import.meta.url` works in both source (ts-node/tsx) and bundled ESM.
  // Source:  .../lib/db/src/migrate.ts  → ../../migrations = lib/db/migrations ✓
  // Bundled: .../dist/index.mjs         → ../migrations = dist/migrations ✓
  //   (build.mjs copies lib/db/migrations → dist/migrations)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(__dirname, "migrations");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

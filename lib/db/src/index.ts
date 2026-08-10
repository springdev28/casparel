import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { sslForConnectionString } from "./ssl";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = process.env.DATABASE_URL.trim();
const ssl = sslForConnectionString(connectionString);

export const pool = new Pool({
  connectionString,
  ...(ssl ? { ssl } : {}),
  min: 1,
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
export { runMigrations } from "./migrate";

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function shouldUseSsl(connectionString: string): boolean {
  if (connectionString.includes("sslmode=")) return false;
  return process.env.NODE_ENV === "production" && !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(shouldUseSsl(process.env.DATABASE_URL) ? { ssl: true } : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
export { runMigrations } from "./migrate";

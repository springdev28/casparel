/**
 * @fileOverview Persistence support role: provides Drizzle.Config database connection or migration behavior.
 * System connection: consumed by the API before handlers query the shared Drizzle schema.
 */
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});

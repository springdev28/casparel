/**
 * @fileOverview Persistence role: stores shared API and AI rate-limit counters.
 * System connection: written by the API rate-limit store and usage reporting;
 * migrated with the rest of the production schema so those routes never depend
 * on a best-effort table creation during process startup.
 */
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const rateLimitHitsTable = pgTable(
  "rate_limit_hits",
  {
    key: text("key").primaryKey(),
    hits: integer("hits").notNull().default(0),
    resetTime: timestamp("reset_time", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => [index("rate_limit_hits_reset_time_idx").on(table.resetTime)],
);

export type RateLimitHit = typeof rateLimitHitsTable.$inferSelect;

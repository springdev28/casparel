import {
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const sourceReviewCacheTable = pgTable(
  "source_review_cache",
  {
    id: serial("id").primaryKey(),
    canonicalUrl: text("canonical_url").notNull(),
    mode: text("mode").notNull(),
    report: jsonb("report").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("source_review_cache_url_mode_idx").on(
      table.canonicalUrl,
      table.mode,
    ),
  ],
);

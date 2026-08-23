/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Reviews domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import {
  index,
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { resourcesTable } from "./resources";

export const reviewsTable = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    resourceId: integer("resource_id")
      .notNull()
      // A review is about the resource and cannot outlive it; the column is
      // NOT NULL, so the row goes with it rather than blocking the delete.
      .references(() => resourcesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("reviews_resource_id_idx").on(table.resourceId)],
);

export const insertReviewSchema = createInsertSchema(reviewsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviewsTable.$inferSelect;

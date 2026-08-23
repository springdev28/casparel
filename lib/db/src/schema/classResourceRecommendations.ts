/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Class Resource Recommendations domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import { pgEnum, pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { classesTable } from "./classes";
import { resourcesTable } from "./resources";
import { usersTable } from "./users";

export const classResourceRecommendationStatusEnum = pgEnum("class_resource_recommendation_status", ["pending", "approved", "declined"]);

export const classResourceRecommendationsTable = pgTable("class_resource_recommendations", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull().references(() => classesTable.id, { onDelete: "cascade" }),
  resourceId: integer("resource_id").notNull().references(() => resourcesTable.id, { onDelete: "cascade" }),
  recommendedById: integer("recommended_by_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: classResourceRecommendationStatusEnum("status").notNull().default("pending"),
  note: text("note"),
  reviewedById: integer("reviewed_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("class_resource_recommendations_pending_unique").on(table.classId, table.resourceId, table.recommendedById, table.status)]);

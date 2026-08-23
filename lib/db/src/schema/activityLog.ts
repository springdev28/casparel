/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Activity Log domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import { index, pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const activityTypeEnum = pgEnum("activity_type", [
  "review",
  "resource",
  "list",
  "schedule",
  "class",
]);

export const activityLogTable = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  type: activityTypeEnum("type").notNull(),
  message: text("message").notNull(),
  workspaceRole: text("workspace_role").$type<"student" | "teacher" | "shared">().notNull().default("shared"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [
  // GET /activity/recent: where (user_id, workspace_role) order by created_at desc.
  index("activity_log_user_role_created_idx").on(
    table.userId,
    table.workspaceRole,
    table.createdAt.desc(),
  ),
]);

export const insertActivityLogSchema = createInsertSchema(activityLogTable).omit({ id: true, createdAt: true });
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogTable.$inferSelect;

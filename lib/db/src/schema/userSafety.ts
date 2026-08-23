/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the User Safety domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import { pgEnum, pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userReportReasonEnum = pgEnum("user_report_reason", ["spam", "harassment", "impersonation", "unsafe_content", "other"]);

export const userBlocksTable = pgTable("user_blocks", {
  id: serial("id").primaryKey(),
  blockerId: integer("blocker_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  blockedId: integer("blocked_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
}, (table) => [uniqueIndex("user_blocks_pair_idx").on(table.blockerId, table.blockedId)]);

export const userReportsTable = pgTable("user_reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reportedId: integer("reported_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reason: userReportReasonEnum("reason").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

/**
 * @fileOverview Persistence role: records durable, human-explainable administrator changes.
 * System connection: admin routes write these rows in the same transaction as sensitive account changes so later audits can reconstruct who changed what and why.
 */
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const adminAuditLogsTable = pgTable(
  "admin_audit_logs",
  {
    id: serial("id").primaryKey(),
    // IDs are intentionally retained as values rather than foreign keys. An
    // account deletion must not erase or null the history explaining a prior
    // entitlement or moderation decision.
    actorUserId: integer("actor_user_id").notNull(),
    targetUserId: integer("target_user_id"),
    action: text("action").notNull(),
    reason: text("reason").notNull(),
    beforeState: jsonb("before_state")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    afterState: jsonb("after_state")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("admin_audit_logs_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
    index("admin_audit_logs_target_created_idx").on(
      table.targetUserId,
      table.createdAt,
    ),
  ],
);

export type AdminAuditLog = typeof adminAuditLogsTable.$inferSelect;

/**
 * @fileOverview Persistence role: stores encrypted customer support requests.
 * System connection: written by the public support endpoint and reviewed by administrators.
 */
import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const supportRequestStatuses = ["new", "in_progress", "resolved"] as const;
export type SupportRequestStatus = (typeof supportRequestStatuses)[number];

export const supportRequestCategories = [
  "account",
  "billing",
  "resources",
  "classes",
  "privacy",
  "safety",
  "technical",
  "other",
] as const;
export type SupportRequestCategory = (typeof supportRequestCategories)[number];

export const supportRequestsTable = pgTable(
  "support_requests",
  {
    id: serial("id").primaryKey(),
    category: text("category").$type<SupportRequestCategory>().notNull(),
    emailEncrypted: text("email_encrypted").notNull(),
    subjectEncrypted: text("subject_encrypted").notNull(),
    messageEncrypted: text("message_encrypted").notNull(),
    deviceEncrypted: text("device_encrypted"),
    status: text("status").$type<SupportRequestStatus>().notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("support_requests_status_created_idx").on(table.status, table.createdAt),
    index("support_requests_created_idx").on(table.createdAt),
  ],
);

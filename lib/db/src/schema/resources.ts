import {
  index,
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const resourceFormatEnum = pgEnum("resource_format", [
  "article",
  "video",
  "pdf",
  "podcast",
  "interactive",
  "other",
]);

export const resourcesTable = pgTable(
  "resources",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    format: resourceFormatEnum("format").notNull().default("other"),
    subject: text("subject").notNull(),
    gradeLevel: text("grade_level").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    workspaceRole: text("workspace_role")
      .$type<"student" | "teacher" | "shared">()
      .notNull()
      .default("student"),
    submittedById: integer("submitted_by_id")
      .notNull()
      .references(() => usersTable.id),
    // Follows the forum moderationStatus convention (plain text + $type, not a
    // pgEnum) but with the default inverted: user submissions start unverified
    // and are published by an admin, or auto-cleared at insert time when the URL
    // is already in the vetted catalog or the submitter is a verified account.
    verificationStatus: text("verification_status")
      .$type<"unverified" | "verified" | "rejected">()
      .notNull()
      .default("unverified"),
    // Why it was verified — "legacy" marks rows grandfathered by the migration.
    verificationSource: text("verification_source").$type<
      "catalog" | "trusted-submitter" | "reviewer" | "legacy"
    >(),
    verificationNote: text("verification_note"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("resources_created_at_idx").on(table.createdAt),
    index("resources_verification_status_idx").on(table.verificationStatus),
    index("resources_title_trgm_idx").using(
      "gin",
      table.title.op("gin_trgm_ops"),
    ),
    index("resources_description_trgm_idx").using(
      "gin",
      table.description.op("gin_trgm_ops"),
    ),
    index("resources_subject_trgm_idx").using(
      "gin",
      table.subject.op("gin_trgm_ops"),
    ),
  ],
);

export const insertResourceSchema = createInsertSchema(resourcesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertResource = z.infer<typeof insertResourceSchema>;
export type Resource = typeof resourcesTable.$inferSelect;

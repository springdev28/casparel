import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
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

export const resourcesTable = pgTable("resources", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  format: resourceFormatEnum("format").notNull().default("other"),
  subject: text("subject").notNull(),
  gradeLevel: text("grade_level").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  submittedById: integer("submitted_by_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const insertResourceSchema = createInsertSchema(resourcesTable).omit({ id: true, createdAt: true });
export type InsertResource = z.infer<typeof insertResourceSchema>;
export type Resource = typeof resourcesTable.$inferSelect;

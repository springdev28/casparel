import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export type StudyActivityCard = {
  id: string;
  term: string;
  answer: string;
};

export const studyActivitiesTable = pgTable("study_activities", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  workspaceRole: text("workspace_role")
    .$type<"student" | "teacher">()
    .notNull()
    .default("student"),
  title: text("title").notNull(),
  subject: text("subject"),
  cards: jsonb("cards").$type<StudyActivityCard[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export type StudyActivity = typeof studyActivitiesTable.$inferSelect;

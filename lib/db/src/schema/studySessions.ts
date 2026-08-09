import { pgTable, serial, integer, text, timestamp, pgEnum, primaryKey, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { resourcesTable } from "./resources";
import { classesTable } from "./classes";

export const sessionParticipantStatusEnum = pgEnum("session_participant_status", [
  "pending",
  "accepted",
  "declined",
]);

export const studySessionsTable = pgTable("study_sessions", {
  id: serial("id").primaryKey(),
  organizerId: integer("organizer_id")
    .notNull()
    .references(() => usersTable.id),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true, mode: "string" }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  topic: text("topic"),
  resourceId: integer("resource_id").references(() => resourcesTable.id),
  meetingUrl: text("meeting_url").notNull(),
  googleCalendarEventId: text("google_calendar_event_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export const studySessionParticipantsTable = pgTable(
  "study_session_participants",
  {
    sessionId: integer("session_id")
      .notNull()
      .references(() => studySessionsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    status: sessionParticipantStatusEnum("status").notNull().default("pending"),
    respondedAt: timestamp("responded_at", { withTimezone: true, mode: "string" }),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.userId] })],
);

export const insertStudySessionSchema = createInsertSchema(studySessionsTable).omit({
  id: true,
  organizerId: true,
  createdAt: true,
});
export type InsertStudySession = z.infer<typeof insertStudySessionSchema>;
export type StudySession = typeof studySessionsTable.$inferSelect;
export type StudySessionParticipant = typeof studySessionParticipantsTable.$inferSelect;

export type StudyActivityCard = {
  id: string;
  term: string;
  answer: string;
  choices?: string[];
  correctChoiceIndex?: number;
  imageData?: string | null;
  imageAlt?: string | null;
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
  classId: integer("class_id").references(() => classesTable.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  subject: text("subject"),
  mode: text("mode")
    .$type<"all" | "flashcards" | "practice" | "quiz" | "true-false" | "match" | "scramble" | "missing-word" | "random">()
    .notNull()
    .default("flashcards"),
  shareToken: text("share_token"),
  cards: jsonb("cards").$type<StudyActivityCard[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("study_activities_share_token_idx").on(table.shareToken),
]);

export type StudyActivity = typeof studyActivitiesTable.$inferSelect;

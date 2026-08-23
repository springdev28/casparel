/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Learning Evidence domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { resourcesTable } from "./resources";
import { learningGoalsTable } from "./learningGoals";

export const learningEvidenceTable = pgTable(
  "learning_evidence",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    resourceId: integer("resource_id").references(() => resourcesTable.id, {
      onDelete: "set null",
    }),
    learningGoalId: integer("learning_goal_id").references(
      () => learningGoalsTable.id,
      { onDelete: "set null" },
    ),
    // These fields connect an evidence checkpoint to the exact path work that
    // produced it without turning collaborative calendar sessions into a solo timer log.
    pathStepId: text("path_step_id"),
    studyDurationSeconds: integer("study_duration_seconds"),
    clientSubmissionId: text("client_submission_id"),
    concept: text("concept").notNull(),
    confidence: integer("confidence").notNull(),
    understanding: integer("understanding").notNull(),
    reflection: text("reflection"),
    misconception: text("misconception"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // A stable client key makes retry-after-timeout converge on the same proof
    // record. PostgreSQL still permits legacy rows with a null submission key.
    uniqueIndex("learning_evidence_user_submission_unique").on(
      table.userId,
      table.clientSubmissionId,
    ),
  ],
);

export type LearningEvidence = typeof learningEvidenceTable.$inferSelect;

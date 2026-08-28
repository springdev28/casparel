/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Learning Evidence domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { resourcesTable } from "./resources";
import { learningGoalsTable } from "./learningGoals";

export const learningEvidenceTable = pgTable("learning_evidence", {
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
  /**
   * The path step this came from, when it came from one.
   *
   * A step id rather than a foreign key, because steps live inside the goal's
   * jsonb path and have no table of their own. It is what lets a completed
   * step say "checked in" and what stops a second tick recording a second
   * check-in for the same step.
   */
  pathStepId: text("path_step_id"),
  concept: text("concept").notNull(),
  confidence: integer("confidence").notNull(),
  understanding: integer("understanding").notNull(),
  reflection: text("reflection"),
  misconception: text("misconception"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
}, (table) => [
  // Read before every step completion, to decide whether this step has already
  // been checked in.
  index("learning_evidence_goal_step_idx").on(
    table.learningGoalId,
    table.pathStepId,
  ),
]);

export type LearningEvidence = typeof learningEvidenceTable.$inferSelect;

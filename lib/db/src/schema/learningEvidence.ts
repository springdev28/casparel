import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
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
  concept: text("concept").notNull(),
  confidence: integer("confidence").notNull(),
  understanding: integer("understanding").notNull(),
  reflection: text("reflection"),
  misconception: text("misconception"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export type LearningEvidence = typeof learningEvidenceTable.$inferSelect;

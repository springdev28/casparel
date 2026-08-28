/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Learning Goals domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import {
  index,
  pgEnum,
  pgTable,
  serial,
  integer,
  text,
  date,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { resourceListsTable } from "./resourceLists";

export const learningGoalStatusEnum = pgEnum("learning_goal_status", [
  "active",
  "paused",
  "completed",
]);
export const learningGoalLevelEnum = pgEnum("learning_goal_level", [
  "beginner",
  "intermediate",
  "advanced",
]);

/**
 * One step on a learning path.
 *
 * `resourceId` is optional and nullable on purpose: every step written before
 * a learner could attach a resource has no such key, and a step that is only a
 * search intent still has none. It is not a foreign key -- this is a jsonb
 * document -- so a reader has to treat the id as a resource that may since have
 * gone, which is what the screens that open one do.
 */
export type LearningPathStepRecord = {
  id: string;
  title: string;
  query: string;
  completed: boolean;
  resourceId?: number | null;
};

export const learningGoalsTable = pgTable("learning_goals", {
  id: serial("id").primaryKey(),
  workspaceRole: text("workspace_role").$type<"student" | "teacher">().notNull().default("student"),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  description: text("description"),
  level: learningGoalLevelEnum("level").notNull().default("beginner"),
  preferredFormats: text("preferred_formats").array(),
  targetDate: date("target_date", { mode: "string" }),
  status: learningGoalStatusEnum("status").notNull().default("active"),
  /**
   * The Learning List this goal's path was built from, when it was built from
   * one. `set null` rather than cascade on purpose: the goal is the learner's
   * own work and outlives the list it came from; what is lost when the list
   * goes is the provenance, not the path.
   */
  sourceListId: integer("source_list_id").references(
    () => resourceListsTable.id,
    { onDelete: "set null" },
  ),
  pathSteps: jsonb("path_steps")
    .$type<LearningPathStepRecord[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
}, (table) => [
  // Building a path from a list asks "has this learner already built one from
  // this list?" on every attempt, which is what makes the write idempotent.
  index("learning_goals_source_list_idx").on(table.userId, table.sourceListId),
]);

export type LearningGoal = typeof learningGoalsTable.$inferSelect;

export const goalPathTemplatesTable = pgTable("goal_path_templates", {
  id: serial("id").primaryKey(),
  creatorId: integer("creator_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  creatorName: text("creator_name").notNull(),
  sourceGoalId: integer("source_goal_id").notNull(),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  description: text("description"),
  level: learningGoalLevelEnum("level").notNull().default("beginner"),
  pathSteps: jsonb("path_steps")
    .$type<LearningPathStepRecord[]>()
    .notNull()
    .default([]),
  useCount: integer("use_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export type GoalPathTemplate = typeof goalPathTemplatesTable.$inferSelect;

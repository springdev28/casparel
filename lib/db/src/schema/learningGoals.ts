import {
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
  pathSteps: jsonb("path_steps")
    .$type<
      Array<{
        id: string;
        title: string;
        query: string;
        completed: boolean;
      }>
    >()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export type LearningGoal = typeof learningGoalsTable.$inferSelect;

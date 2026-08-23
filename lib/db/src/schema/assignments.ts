/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Assignments domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import {
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { classesTable } from "./classes";
import { resourcesTable } from "./resources";
import { studyActivitiesTable } from "./studySessions";
import { usersTable } from "./users";

export const classAssignmentsTable = pgTable(
  "class_assignments",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classesTable.id, { onDelete: "cascade" }),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    instructions: text("instructions"),
    resourceId: integer("resource_id").references(() => resourcesTable.id, {
      onDelete: "set null",
    }),
    activityId: integer("activity_id").references(
      () => studyActivitiesTable.id,
      { onDelete: "set null" },
    ),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("class_assignments_class_due_idx").on(table.classId, table.dueAt),
  ],
);

export const assignmentCompletionsTable = pgTable(
  "assignment_completions",
  {
    assignmentId: integer("assignment_id")
      .notNull()
      .references(() => classAssignmentsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.assignmentId, table.userId] })],
);

export type ClassAssignment = typeof classAssignmentsTable.$inferSelect;

/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Workflow Events domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { classAssignmentsTable } from "./assignments";
import { classesTable } from "./classes";
import { resourcesTable } from "./resources";
import { studyActivitiesTable } from "./studySessions";
import { usersTable } from "./users";

export type WorkflowEventType =
  | "resource_viewed"
  | "resource_reviewed"
  | "resource_saved"
  | "resource_linked_to_goal"
  | "activity_created"
  | "activity_remixed"
  | "class_shared"
  | "assignment_created"
  | "assignment_completed";

export const workflowEventsTable = pgTable(
  "workflow_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    event: text("event").$type<WorkflowEventType>().notNull(),
    resourceId: integer("resource_id").references(() => resourcesTable.id, {
      onDelete: "set null",
    }),
    activityId: integer("activity_id").references(
      () => studyActivitiesTable.id,
      { onDelete: "set null" },
    ),
    classId: integer("class_id").references(() => classesTable.id, {
      onDelete: "set null",
    }),
    assignmentId: integer("assignment_id").references(
      () => classAssignmentsTable.id,
      { onDelete: "set null" },
    ),
    context: jsonb("context")
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("workflow_events_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("workflow_events_event_created_idx").on(
      table.event,
      table.createdAt,
    ),
    index("workflow_events_resource_idx").on(table.resourceId),
    index("workflow_events_activity_idx").on(table.activityId),
    index("workflow_events_class_idx").on(table.classId),
  ],
);

export type WorkflowEvent = typeof workflowEventsTable.$inferSelect;

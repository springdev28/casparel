/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Resource Lists domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { classesTable } from "./classes";
import { resourcesTable } from "./resources";

export const resourceListsTable = pgTable("resource_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  workspaceRole: text("workspace_role").$type<"student" | "teacher" | "shared">().notNull().default("student"),
  ownerId: integer("owner_id").notNull().references(() => usersTable.id),
  classId: integer("class_id").references(() => classesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

/**
 * What a resource is doing in a list.
 *
 * A Learning List is an ordered set rather than a folder, and the order alone
 * does not say why something is third. Four roles, kept few enough to pick on
 * a phone and distinct enough to be worth picking: something that teaches the
 * idea, something to practise it on, a worked case, and something to look
 * things up in.
 *
 * Nullable: every item added before this has no role, and saying nothing is a
 * legitimate answer for somebody who just wants the list.
 */
export type ListItemRole = "explanation" | "practice" | "example" | "reference";

export const listItemsTable = pgTable("list_items", {
  id: serial("id").primaryKey(),
  listId: integer("list_id")
    .notNull()
    // A list item is meaningless without its list, and the column is NOT NULL,
    // so the row goes with it rather than blocking the list delete.
    .references(() => resourceListsTable.id, { onDelete: "cascade" }),
  resourceId: integer("resource_id")
    .notNull()
    // A list item is meaningless without its resource, and the column is NOT
    // NULL, so the row goes with it.
    .references(() => resourcesTable.id, { onDelete: "cascade" }),
  note: text("note"),
  role: text("role").$type<ListItemRole>(),
  position: integer("position").notNull().default(0),
  addedAt: timestamp("added_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const insertResourceListSchema = createInsertSchema(resourceListsTable).omit({ id: true, createdAt: true });
export type InsertResourceList = z.infer<typeof insertResourceListSchema>;
export type ResourceList = typeof resourceListsTable.$inferSelect;

export const insertListItemSchema = createInsertSchema(listItemsTable).omit({ id: true, addedAt: true });
export type InsertListItem = z.infer<typeof insertListItemSchema>;
export type ListItem = typeof listItemsTable.$inferSelect;

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

export const listItemsTable = pgTable("list_items", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull().references(() => resourceListsTable.id),
  resourceId: integer("resource_id").notNull().references(() => resourcesTable.id),
  note: text("note"),
  position: integer("position").notNull().default(0),
  addedAt: timestamp("added_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const insertResourceListSchema = createInsertSchema(resourceListsTable).omit({ id: true, createdAt: true });
export type InsertResourceList = z.infer<typeof insertResourceListSchema>;
export type ResourceList = typeof resourceListsTable.$inferSelect;

export const insertListItemSchema = createInsertSchema(listItemsTable).omit({ id: true, addedAt: true });
export type InsertListItem = z.infer<typeof insertListItemSchema>;
export type ListItem = typeof listItemsTable.$inferSelect;

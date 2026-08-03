import { pgTable, serial, integer, text, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { resourcesTable } from "./resources";
import { resourceListsTable } from "./resourceLists";
import { classesTable } from "./classes";

export const scheduleBlocksTable = pgTable("schedule_blocks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  resourceId: integer("resource_id").references(() => resourcesTable.id),
  listId: integer("list_id").references(() => resourceListsTable.id),
  classId: integer("class_id").references(() => classesTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const insertScheduleBlockSchema = createInsertSchema(scheduleBlocksTable).omit({ id: true, createdAt: true });
export type InsertScheduleBlock = z.infer<typeof insertScheduleBlockSchema>;
export type ScheduleBlock = typeof scheduleBlocksTable.$inferSelect;

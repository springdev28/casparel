import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const classesTable = pgTable("classes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  gradeLevel: text("grade_level").notNull(),
  description: text("description"),
  seatingRows: integer("seating_rows").notNull().default(4),
  seatingColumns: integer("seating_columns").notNull().default(5),
  seatingLayout: jsonb("seating_layout").$type<Array<{ id: string; shape: "rectangle" | "round" | "oval" | "trapezoid"; x: number; y: number; width: number; height: number; rotation: number; capacity: number; label: string }>>(),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const insertClassSchema = createInsertSchema(classesTable).omit({ id: true, createdAt: true });
export type InsertClass = z.infer<typeof insertClassSchema>;
export type Class = typeof classesTable.$inferSelect;

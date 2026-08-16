import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const classesTable = pgTable("classes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  gradeLevel: text("grade_level").notNull(),
  description: text("description"),
  joinCode: text("join_code"),
  seatingRows: integer("seating_rows").notNull().default(4),
  seatingColumns: integer("seating_columns").notNull().default(5),
  seatingLayout:
    jsonb("seating_layout").$type<
      Array<{
        id: string;
        /** Absent means desk; podium/board/text are seatless room furniture. */
        kind?:
          | "desk"
          | "chair"
          | "teacherDesk"
          | "podium"
          | "board"
          | "text";
        shape: "rectangle" | "polygon" | "round" | "oval" | "trapezoid";
        angle?: number;
        sides?: number;
        x: number;
        y: number;
        width: number;
        height: number;
        rotation: number;
        capacity: number;
        label: string;
        /** Annotation content for text elements. */
        text?: string | null;
      }>
    >(),
  teacherId: integer("teacher_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export const insertClassSchema = createInsertSchema(classesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertClass = z.infer<typeof insertClassSchema>;
export type Class = typeof classesTable.$inferSelect;

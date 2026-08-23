/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Class Members domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import { pgTable, integer, timestamp, primaryKey, pgEnum, text } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { classesTable } from "./classes";

export const memberRoleEnum = pgEnum("member_role", ["student", "teacher"]);

export const classMembersTable = pgTable(
  "class_members",
  {
    userId: integer("user_id").notNull().references(() => usersTable.id),
    classId: integer("class_id").notNull().references(() => classesTable.id),
    role: memberRoleEnum("role").notNull().default("student"),
    teacherNote: text("teacher_note"),
    seatRow: integer("seat_row"),
    seatColumn: integer("seat_column"),
    seatDeskId: text("seat_desk_id"),
    seatPosition: integer("seat_position"),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.classId] })],
);

export type ClassMember = typeof classMembersTable.$inferSelect;

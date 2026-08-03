import { pgTable, integer, timestamp, primaryKey, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { classesTable } from "./classes";

export const memberRoleEnum = pgEnum("member_role", ["student", "teacher"]);

export const classMembersTable = pgTable(
  "class_members",
  {
    userId: integer("user_id").notNull().references(() => usersTable.id),
    classId: integer("class_id").notNull().references(() => classesTable.id),
    role: memberRoleEnum("role").notNull().default("student"),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.classId] })],
);

export type ClassMember = typeof classMembersTable.$inferSelect;

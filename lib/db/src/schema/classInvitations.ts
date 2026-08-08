import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { classesTable } from "./classes";
import { memberRoleEnum } from "./classMembers";
import { usersTable } from "./users";

export const classInvitationsTable = pgTable(
  "class_invitations",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    invitedById: integer("invited_by_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("student"),
    status: text("status")
      .$type<"pending" | "accepted" | "declined">()
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    respondedAt: timestamp("responded_at", {
      withTimezone: true,
      mode: "string",
    }),
  },
  (table) => [
    uniqueIndex("class_invitations_class_user_idx").on(
      table.classId,
      table.userId,
    ),
    index("class_invitations_user_status_idx").on(table.userId, table.status),
  ],
);

export type ClassInvitation = typeof classInvitationsTable.$inferSelect;

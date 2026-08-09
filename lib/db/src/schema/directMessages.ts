import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const directConversationsTable = pgTable(
  "direct_conversations",
  {
    id: serial("id").primaryKey(),
    firstUserId: integer("first_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    secondUserId: integer("second_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    requestedById: integer("requested_by_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status")
      .$type<"pending" | "accepted" | "declined">()
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("direct_conversations_pair_unique").on(
      table.firstUserId,
      table.secondUserId,
    ),
    index("direct_conversations_first_idx").on(table.firstUserId),
    index("direct_conversations_second_idx").on(table.secondUserId),
  ],
);

export const directMessagesTable = pgTable(
  "direct_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => directConversationsTable.id, { onDelete: "cascade" }),
    senderId: integer("sender_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    isAdminMessage: boolean("is_admin_message").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("direct_messages_conversation_idx").on(table.conversationId)],
);

export type DirectConversation = typeof directConversationsTable.$inferSelect;
export type DirectMessage = typeof directMessagesTable.$inferSelect;

import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export type InterfaceColorsPreference = {
  background: string;
  surface: string;
  primary: string;
  accent: string;
};

export type SearchHistoryPreference = {
  query: string;
  searchedAt: string;
};

export const userPreferencesTable = pgTable("user_preferences", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  language: text("language"),
  interfaceColors: jsonb("interface_colors").$type<InterfaceColorsPreference>(),
  ambientStyle: text("ambient_style"),
  ambientIntensity: real("ambient_intensity"),
  readNotificationIds: integer("read_notification_ids")
    .array()
    .notNull()
    .default([]),
  dashboardGoalIds: jsonb("dashboard_goal_ids")
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  continueStudying: jsonb("continue_studying")
    .$type<Record<string, number[]>>()
    .notNull()
    .default({}),
  pendingCheckIns: jsonb("pending_check_ins")
    .$type<Record<string, { concept: string; prompt: string }>>()
    .notNull()
    .default({}),
  searchHistory: jsonb("search_history")
    .$type<SearchHistoryPreference[]>()
    .notNull()
    .default([]),
  resourceSearchState: jsonb("resource_search_state").$type<
    Record<string, unknown>
  >(),
  allowMessageRequests: boolean("allow_message_requests")
    .notNull()
    .default(true),
  tutorialSeen: boolean("tutorial_seen").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
});

export type UserPreferences = typeof userPreferencesTable.$inferSelect;

import { pgTable, serial, text, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["student", "teacher", "admin"]);

export const profileVisibilityEnum = pgEnum("profile_visibility", ["everyone", "classmates", "private"]);
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("student"),
  activeRole: userRoleEnum("active_role").notNull().default("student"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  subjects: text("subjects").array(),
  gradeOrDept: text("grade_or_dept"),
  timezone: text("timezone"),
  profileVisibility: profileVisibilityEnum("profile_visibility").notNull().default("classmates"),
  libraryVisibility: profileVisibilityEnum("library_visibility").notNull().default("classmates"),
  showBio: boolean("show_bio").notNull().default(true),
  showSubjects: boolean("show_subjects").notNull().default(true),
  showGradeOrDept: boolean("show_grade_or_dept").notNull().default(true),
  showWebsite: boolean("show_website").notNull().default(true),
  websiteUrl: text("website_url"),
  teacherVerified: boolean("teacher_verified").notNull().default(false),
  plan: text("plan").notNull().default("free"),
  planExpiresAt: timestamp("plan_expires_at", { withTimezone: true, mode: "string" }),
  bannedAt: timestamp("banned_at", { withTimezone: true, mode: "string" }),
  bannedReason: text("banned_reason"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

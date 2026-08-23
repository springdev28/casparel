/**
 * @fileOverview Persistence role: defines the Drizzle tables, relations, and indexes for the Forum domain.
 * System connection: re-exported by schema/index.ts, migrated through lib/db/migrations, and queried by API route/domain modules.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { classesTable } from "./classes";

export type MaterialType =
  | "video"
  | "infographic"
  | "article"
  | "worksheet"
  | "activity"
  | "notes";

export const forumMaterialsTable = pgTable(
  "forum_materials",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    unit: text("unit").notNull(),
    topic: text("topic").notNull(),
    materialType: text("material_type").$type<MaterialType>().notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    sources: jsonb("sources").$type<string[]>().notNull().default([]),
    uploaderId: integer("uploader_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    uploaderName: text("uploader_name").notNull(),
    uploaderRole: text("uploader_role").$type<"student" | "teacher" | "admin">().notNull(),
    linkUrl: text("link_url"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    fileBase64: text("file_base64"),
    moderationStatus: text("moderation_status")
      .$type<"approved" | "review" | "hidden">()
      .notNull()
      .default("approved"),
    moderationNote: text("moderation_note"),
    viewCount: integer("view_count").notNull().default(0),
    downloadCount: integer("download_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("forum_materials_title_unique").on(table.title),
  ],
);

export const forumMaterialApprovalsTable = pgTable(
  "forum_material_approvals",
  {
    id: serial("id").primaryKey(),
    materialId: integer("material_id")
      .notNull()
      .references(() => forumMaterialsTable.id, { onDelete: "cascade" }),
    teacherId: integer("teacher_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    teacherName: text("teacher_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("forum_material_approval_unique").on(
      table.materialId,
      table.teacherId,
    ),
  ],
);

export const forumPostsTable = pgTable("forum_posts", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").references(() => classesTable.id, {
    onDelete: "cascade",
  }),
  authorId: integer("author_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  authorName: text("author_name").notNull(),
  authorRole: text("author_role").$type<"student" | "teacher" | "admin">().notNull(),
  kind: text("kind").$type<"post" | "survey">().notNull().default("post"),
  title: text("title"),
  body: text("body").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  surveyOptions: jsonb("survey_options")
    .$type<Array<{ id: string; text: string }>>()
    .notNull()
    .default([]),
  allowMultipleVotes: boolean("allow_multiple_votes").notNull().default(false),
  quotedPostId: integer("quoted_post_id"),
  attachmentMaterialId: integer("attachment_material_id").references(
    () => forumMaterialsTable.id,
    { onDelete: "set null" },
  ),
  attachmentFileName: text("attachment_file_name"),
  attachmentMimeType: text("attachment_mime_type"),
  attachmentFileBase64: text("attachment_file_base64"),
  moderationStatus: text("moderation_status")
    .$type<"approved" | "review" | "hidden">()
    .notNull()
    .default("approved"),
  moderationNote: text("moderation_note"),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
}, (table) => [
  index("forum_posts_class_id_idx").on(table.classId),
  index("forum_posts_quoted_post_id_idx").on(table.quotedPostId),
]);

export const forumPostRepostsTable = pgTable(
  "forum_post_reposts",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => forumPostsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("forum_post_reposts_user_post_unique").on(
      table.userId,
      table.postId,
    ),
    index("forum_post_reposts_post_id_idx").on(table.postId),
  ],
);

export const forumCommentsTable = pgTable("forum_comments", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  authorName: text("author_name").notNull(),
  authorRole: text("author_role").$type<"student" | "teacher" | "admin">().notNull(),
  targetType: text("target_type").$type<"material" | "post">().notNull(),
  targetId: integer("target_id").notNull(),
  parentId: integer("parent_id"),
  body: text("body").notNull(),
  moderationStatus: text("moderation_status")
    .$type<"approved" | "review" | "hidden">()
    .notNull()
    .default("approved"),
  moderationNote: text("moderation_note"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
}, (table) => [
  // The feed counts comments per (target_type, target_id) once per row.
  index("forum_comments_target_idx").on(table.targetType, table.targetId),
]);

export const forumLikesTable = pgTable(
  "forum_likes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    targetType: text("target_type").$type<"material" | "post">().notNull(),
    targetId: integer("target_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("forum_like_unique").on(
      table.userId,
      table.targetType,
      table.targetId,
    ),
    // The feed counts likes by target, so it cannot use the unique index above
    // (wrong leading column).
    index("forum_likes_target_idx").on(table.targetType, table.targetId),
  ],
);

export const forumSurveyVotesTable = pgTable(
  "forum_survey_votes",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => forumPostsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    optionId: text("option_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("forum_survey_vote_option_unique").on(
      table.postId,
      table.userId,
      table.optionId,
    ),
  ],
);

export const forumReportsTable = pgTable("forum_reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  reporterName: text("reporter_name").notNull(),
  targetType: text("target_type")
    .$type<"material" | "post" | "comment">()
    .notNull(),
  targetId: integer("target_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status")
    .$type<"pending" | "resolved" | "dismissed">()
    .notNull()
    .default("pending"),
  aiFlagged: boolean("ai_flagged").notNull().default(false),
  aiAssessment: text("ai_assessment"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "string" }),
});

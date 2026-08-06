ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "teacher_verified" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "forum_materials" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "unit" text NOT NULL,
  "topic" text NOT NULL,
  "material_type" text NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "uploader_id" integer,
  "uploader_name" text NOT NULL,
  "uploader_role" text NOT NULL,
  "link_url" text,
  "file_name" text,
  "mime_type" text,
  "file_base64" text,
  "moderation_status" text DEFAULT 'approved' NOT NULL,
  "moderation_note" text,
  "view_count" integer DEFAULT 0 NOT NULL,
  "download_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "forum_materials" ADD CONSTRAINT "forum_materials_uploader_id_users_id_fk"
    FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "forum_materials_title_unique"
  ON "forum_materials" (lower("title"));

CREATE TABLE IF NOT EXISTS "forum_material_approvals" (
  "id" serial PRIMARY KEY NOT NULL,
  "material_id" integer NOT NULL,
  "teacher_id" integer,
  "teacher_name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "forum_material_approvals" ADD CONSTRAINT "forum_material_approvals_material_id_fk"
    FOREIGN KEY ("material_id") REFERENCES "public"."forum_materials"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "forum_material_approvals" ADD CONSTRAINT "forum_material_approvals_teacher_id_fk"
    FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "forum_material_approval_unique"
  ON "forum_material_approvals" ("material_id", "teacher_id");

CREATE TABLE IF NOT EXISTS "forum_posts" (
  "id" serial PRIMARY KEY NOT NULL,
  "author_id" integer,
  "author_name" text NOT NULL,
  "author_role" text NOT NULL,
  "kind" text DEFAULT 'post' NOT NULL,
  "title" text,
  "body" text NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "survey_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "attachment_material_id" integer,
  "moderation_status" text DEFAULT 'approved' NOT NULL,
  "moderation_note" text,
  "view_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_author_id_users_id_fk"
    FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_attachment_material_id_fk"
    FOREIGN KEY ("attachment_material_id") REFERENCES "public"."forum_materials"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "forum_comments" (
  "id" serial PRIMARY KEY NOT NULL,
  "author_id" integer,
  "author_name" text NOT NULL,
  "author_role" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" integer NOT NULL,
  "parent_id" integer,
  "body" text NOT NULL,
  "moderation_status" text DEFAULT 'approved' NOT NULL,
  "moderation_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "forum_comments" ADD CONSTRAINT "forum_comments_author_id_users_id_fk"
    FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "forum_likes" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "target_type" text NOT NULL,
  "target_id" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "forum_likes" ADD CONSTRAINT "forum_likes_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "forum_like_unique"
  ON "forum_likes" ("user_id", "target_type", "target_id");

CREATE TABLE IF NOT EXISTS "forum_survey_votes" (
  "id" serial PRIMARY KEY NOT NULL,
  "post_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "option_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "forum_survey_votes" ADD CONSTRAINT "forum_survey_votes_post_id_fk"
    FOREIGN KEY ("post_id") REFERENCES "public"."forum_posts"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "forum_survey_votes" ADD CONSTRAINT "forum_survey_votes_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "forum_survey_vote_unique"
  ON "forum_survey_votes" ("post_id", "user_id");

CREATE TABLE IF NOT EXISTS "forum_reports" (
  "id" serial PRIMARY KEY NOT NULL,
  "reporter_id" integer,
  "reporter_name" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" integer NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "ai_flagged" boolean DEFAULT false NOT NULL,
  "ai_assessment" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_at" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE "forum_reports" ADD CONSTRAINT "forum_reports_reporter_id_users_id_fk"
    FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

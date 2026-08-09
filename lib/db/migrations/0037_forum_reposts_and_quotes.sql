ALTER TABLE "forum_posts" ADD COLUMN IF NOT EXISTS "quoted_post_id" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "forum_posts"
    ADD CONSTRAINT "forum_posts_quoted_post_id_forum_posts_id_fk"
    FOREIGN KEY ("quoted_post_id") REFERENCES "public"."forum_posts"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "forum_posts_quoted_post_id_idx"
  ON "forum_posts" ("quoted_post_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "forum_post_reposts" (
  "id" serial PRIMARY KEY NOT NULL,
  "post_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "forum_post_reposts_user_post_unique" UNIQUE("user_id", "post_id"),
  CONSTRAINT "forum_post_reposts_post_id_forum_posts_id_fk"
    FOREIGN KEY ("post_id") REFERENCES "public"."forum_posts"("id") ON DELETE cascade,
  CONSTRAINT "forum_post_reposts_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "forum_post_reposts_post_id_idx"
  ON "forum_post_reposts" ("post_id");

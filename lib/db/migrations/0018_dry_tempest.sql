ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "workspace_role" text DEFAULT 'student' NOT NULL;--> statement-breakpoint
ALTER TABLE "resource_lists" ADD COLUMN IF NOT EXISTS "workspace_role" text DEFAULT 'student' NOT NULL;--> statement-breakpoint
ALTER TABLE "learning_goals" ADD COLUMN IF NOT EXISTS "workspace_role" text DEFAULT 'student' NOT NULL;--> statement-breakpoint
UPDATE "resources" AS item SET "workspace_role" = CASE WHEN account."role" = 'teacher' OR (account."role" = 'admin' AND account."active_role" = 'teacher') THEN 'teacher' ELSE 'student' END FROM "users" AS account WHERE item."submitted_by_id" = account."id";
--> statement-breakpoint
UPDATE "resource_lists" AS item SET "workspace_role" = CASE WHEN account."role" = 'teacher' OR (account."role" = 'admin' AND account."active_role" = 'teacher') THEN 'teacher' ELSE 'student' END FROM "users" AS account WHERE item."owner_id" = account."id";
--> statement-breakpoint
UPDATE "learning_goals" AS item SET "workspace_role" = CASE WHEN account."role" = 'teacher' OR (account."role" = 'admin' AND account."active_role" = 'teacher') THEN 'teacher' ELSE 'student' END FROM "users" AS account WHERE item."user_id" = account."id";

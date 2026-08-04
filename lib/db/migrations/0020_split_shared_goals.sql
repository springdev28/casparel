INSERT INTO "learning_goals" (
  "workspace_role", "user_id", "title", "subject", "description", "level",
  "preferred_formats", "target_date", "status", "path_steps", "created_at", "updated_at"
)
SELECT
  'teacher', "user_id", "title", "subject", "description", "level",
  "preferred_formats", "target_date", "status", "path_steps", "created_at", "updated_at"
FROM "learning_goals"
WHERE "workspace_role" = 'shared';--> statement-breakpoint
UPDATE "learning_goals" SET "workspace_role" = 'student' WHERE "workspace_role" = 'shared';

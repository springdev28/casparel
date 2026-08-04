ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "active_role" "user_role" DEFAULT 'student' NOT NULL;
UPDATE "users" SET "active_role" = "role" WHERE "role" IN ('student', 'teacher');

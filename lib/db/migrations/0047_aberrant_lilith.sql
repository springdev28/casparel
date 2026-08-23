-- Separate durable educator capability from the active learner/educator UI
-- workspace. Existing educators and contextual class teachers are backfilled
-- so the compatibility migration cannot remove class access.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "educator_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint

UPDATE "users"
SET "educator_enabled" = true
WHERE "role" IN ('teacher', 'admin')
   OR "active_role" = 'teacher'
   OR EXISTS (
     SELECT 1
     FROM "classes"
     WHERE "classes"."teacher_id" = "users"."id"
   )
   OR EXISTS (
     SELECT 1
     FROM "class_members"
     WHERE "class_members"."user_id" = "users"."id"
       AND "class_members"."role" = 'teacher'
   );

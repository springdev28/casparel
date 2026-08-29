-- Student and teacher are account roles, not billing tiers. Translate every
-- historical value to the equivalent role-agnostic plan. These updates are
-- idempotent so startup migration retries remain safe.
UPDATE "users"
SET "plan" = 'plus'
WHERE "plan" IN ('student-plus', 'teacher-plus');

UPDATE "users"
SET "plan" = 'pro'
WHERE "plan" IN ('student-pro', 'teacher-pro', 'premium');

-- Custom class roles: a short teacher-chosen label per membership, visible to
-- the whole class (unlike teacher_note, which is private to the teacher).
--
-- Hand-trimmed: the generator also tried to drop and re-add foreign keys and
-- re-create indexes that migrations 0045/0046 already applied by hand; its
-- snapshot was simply behind. The 0047 snapshot now records that state, and
-- this file applies only the one real change.
ALTER TABLE "class_members" ADD COLUMN "custom_role" text;

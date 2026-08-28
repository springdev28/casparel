-- What a resource is doing in a Learning List.
--
-- A list is an ordered set rather than a folder, and the order alone does not
-- say why something is third: explanation, practice, example or reference is
-- the learner's own note about the part it plays
-- (docs/core-workflow-mobile-polish.md, "Learning List builder").
--
-- Nullable, and left null for every item added before this. Saying nothing is
-- a legitimate answer, and the list review only draws conclusions from the
-- roles somebody actually set.
--
-- Text rather than an enum: the vocabulary is a product decision that will move
-- before the schema should, and a check constraint here would turn adding a
-- fifth role into a migration on a table people are writing to.

ALTER TABLE "list_items" ADD COLUMN IF NOT EXISTS "role" text;

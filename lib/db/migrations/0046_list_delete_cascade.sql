-- Let a resource list actually be deleted, and index the counters that the
-- forum feed and the dashboard activity inbox run on every page load.
--
-- 1. DELETE /lists/:id (routes/lists.ts) and the admin "lists" work-item delete
--    (routes/admin.ts) both remove the row from `resource_lists` directly.
--    `list_items.list_id` and `schedule_blocks.list_id` were both created
--    ON DELETE NO ACTION, so the delete raised a foreign_key_violation that
--    nothing catches and the owner got an opaque 500 while removing their own
--    list. lists.ts pre-deletes list_items so it survives that one, but any
--    schedule block pointing at the list still blocks it; admin.ts pre-deletes
--    nothing and fails on list_items as well.
--    Same doctrine as migration 0045:
--      list_items       - the row is ABOUT the list and list_id is NOT NULL,
--                         so the row goes with it: CASCADE.
--      schedule_blocks  - the row is the user's own plan that merely points at
--                         a list, and list_id is nullable, so keep the block
--                         and drop the link: SET NULL.
--    Each constraint is dropped IF EXISTS and re-added inside a
--    duplicate_object guard, so re-running this migration is safe.
--
-- 2. GET /forum/materials and GET /forum/posts build likeCount / commentCount /
--    likedByMe as correlated subqueries keyed on (target_type, target_id), once
--    per row for up to 100 rows. `forum_likes` is only indexed as
--    (user_id, target_type, target_id) - the wrong leading column - and
--    `forum_comments` has no index on the target at all, so both are seq-scanned
--    per row. The same aggregate pattern over `reviews` already has
--    reviews_resource_id_idx; the forum tables were missed.
--
-- 3. GET /activity/recent filters (user_id, workspace_role) and sorts
--    created_at desc limit 20. Only user_id is indexed, so every dashboard load
--    fetches and sorts the caller's whole activity history.

DO $$ BEGIN
  ALTER TABLE "list_items" DROP CONSTRAINT IF EXISTS "list_items_list_id_resource_lists_id_fk";
  ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_resource_lists_id_fk"
    FOREIGN KEY ("list_id") REFERENCES "public"."resource_lists"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "schedule_blocks" DROP CONSTRAINT IF EXISTS "schedule_blocks_list_id_resource_lists_id_fk";
  ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_list_id_resource_lists_id_fk"
    FOREIGN KEY ("list_id") REFERENCES "public"."resource_lists"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "forum_likes_target_idx" ON "forum_likes" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "forum_comments_target_idx" ON "forum_comments" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_user_role_created_idx" ON "activity_log" USING btree ("user_id","workspace_role","created_at" DESC);

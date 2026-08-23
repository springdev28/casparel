-- Keep the earliest row if old clients created duplicates before saves became
-- idempotent. This lets the unique index deploy safely on existing databases.
DELETE FROM "list_items" AS "duplicate"
USING "list_items" AS "canonical"
WHERE "duplicate"."list_id" = "canonical"."list_id"
  AND "duplicate"."resource_id" = "canonical"."resource_id"
  AND "duplicate"."id" > "canonical"."id";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "list_items_list_resource_idx"
ON "list_items" USING btree ("list_id","resource_id");

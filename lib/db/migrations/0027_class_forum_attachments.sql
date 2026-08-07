ALTER TABLE "forum_posts" ADD COLUMN "class_id" integer;
--> statement-breakpoint
ALTER TABLE "forum_posts" ADD COLUMN "attachment_file_name" text;
--> statement-breakpoint
ALTER TABLE "forum_posts" ADD COLUMN "attachment_mime_type" text;
--> statement-breakpoint
ALTER TABLE "forum_posts" ADD COLUMN "attachment_file_base64" text;
--> statement-breakpoint
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "forum_posts_class_id_idx" ON "forum_posts" USING btree ("class_id");

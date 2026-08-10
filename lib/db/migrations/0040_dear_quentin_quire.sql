CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "resources_created_at_idx" ON "resources" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "resources_title_trgm_idx" ON "resources" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "resources_description_trgm_idx" ON "resources" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "resources_subject_trgm_idx" ON "resources" USING gin ("subject" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "reviews_resource_id_idx" ON "reviews" USING btree ("resource_id");

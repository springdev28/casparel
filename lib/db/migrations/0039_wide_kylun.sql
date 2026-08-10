CREATE TABLE "workflow_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"event" text NOT NULL,
	"resource_id" integer,
	"activity_id" integer,
	"class_id" integer,
	"assignment_id" integer,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_activity_id_study_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."study_activities"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_assignment_id_class_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."class_assignments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "workflow_events_user_created_idx" ON "workflow_events" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "workflow_events_event_created_idx" ON "workflow_events" USING btree ("event","created_at");
--> statement-breakpoint
CREATE INDEX "workflow_events_resource_idx" ON "workflow_events" USING btree ("resource_id");
--> statement-breakpoint
CREATE INDEX "workflow_events_activity_idx" ON "workflow_events" USING btree ("activity_id");
--> statement-breakpoint
CREATE INDEX "workflow_events_class_idx" ON "workflow_events" USING btree ("class_id");

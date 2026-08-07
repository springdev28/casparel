ALTER TABLE "classes" ADD COLUMN "join_code" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "classes_join_code_idx" ON "classes" USING btree ("join_code") WHERE "join_code" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "class_assignments" (
  "id" serial PRIMARY KEY NOT NULL,
  "class_id" integer NOT NULL,
  "created_by_id" integer NOT NULL,
  "title" text NOT NULL,
  "instructions" text,
  "resource_id" integer,
  "activity_id" integer,
  "due_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_completions" (
  "assignment_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "assignment_completions_assignment_id_user_id_pk" PRIMARY KEY("assignment_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "class_assignments" ADD CONSTRAINT "class_assignments_activity_id_study_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."study_activities"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assignment_completions" ADD CONSTRAINT "assignment_completions_assignment_id_class_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."class_assignments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assignment_completions" ADD CONSTRAINT "assignment_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "class_assignments_class_due_idx" ON "class_assignments" USING btree ("class_id","due_at");

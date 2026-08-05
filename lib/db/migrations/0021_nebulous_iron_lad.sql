DO $$ BEGIN
  CREATE TYPE "public"."class_resource_recommendation_status" AS ENUM('pending', 'approved', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "class_resource_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"class_id" integer NOT NULL,
	"resource_id" integer NOT NULL,
	"recommended_by_id" integer NOT NULL,
	"status" "class_resource_recommendation_status" DEFAULT 'pending' NOT NULL,
	"note" text,
	"reviewed_by_id" integer,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_resource_recommendations" ADD CONSTRAINT "class_resource_recommendations_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_resource_recommendations" ADD CONSTRAINT "class_resource_recommendations_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_resource_recommendations" ADD CONSTRAINT "class_resource_recommendations_recommended_by_id_users_id_fk" FOREIGN KEY ("recommended_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "class_resource_recommendations" ADD CONSTRAINT "class_resource_recommendations_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "class_resource_recommendations_pending_unique" ON "class_resource_recommendations" USING btree ("class_id","resource_id","recommended_by_id","status");
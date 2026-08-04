CREATE TABLE IF NOT EXISTS "learning_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"resource_id" integer,
	"learning_goal_id" integer,
	"concept" text NOT NULL,
	"confidence" integer NOT NULL,
	"understanding" integer NOT NULL,
	"reflection" text,
	"misconception" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_learning_goal_id_learning_goals_id_fk" FOREIGN KEY ("learning_goal_id") REFERENCES "public"."learning_goals"("id") ON DELETE set null ON UPDATE no action;
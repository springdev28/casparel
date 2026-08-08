CREATE TABLE IF NOT EXISTS "class_invitations" (
  "id" serial PRIMARY KEY NOT NULL,
  "class_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "invited_by_id" integer NOT NULL,
  "role" "member_role" DEFAULT 'student' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "responded_at" timestamp with time zone,
  CONSTRAINT "class_invitations_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "class_invitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "class_invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "class_invitations_class_user_idx" ON "class_invitations" ("class_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_invitations_user_status_idx" ON "class_invitations" ("user_id", "status");

CREATE TABLE IF NOT EXISTS "canvases" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "owner_id" integer NOT NULL,
  "class_id" integer,
  "visibility" text DEFAULT 'private' NOT NULL,
  "class_access" text DEFAULT 'view' NOT NULL,
  "share_token" text,
  "document" jsonb DEFAULT '{"nodes":[],"edges":[],"viewport":{"x":0,"y":0,"zoom":1}}'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "canvases_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "canvases_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canvas_collaborators" (
  "canvas_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "role" text DEFAULT 'viewer' NOT NULL,
  "added_by_id" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "canvas_collaborators_canvas_id_user_id_pk" PRIMARY KEY("canvas_id","user_id"),
  CONSTRAINT "canvas_collaborators_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "canvas_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "canvas_collaborators_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "canvases_share_token_idx" ON "canvases" ("share_token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvases_owner_idx" ON "canvases" ("owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvases_class_idx" ON "canvases" ("class_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "canvas_collaborators_user_idx" ON "canvas_collaborators" ("user_id");

ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "allow_message_requests" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "direct_conversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "first_user_id" integer NOT NULL,
  "second_user_id" integer NOT NULL,
  "requested_by_id" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "direct_conversations_pair_unique" UNIQUE("first_user_id", "second_user_id"),
  CONSTRAINT "direct_conversations_first_user_id_users_id_fk" FOREIGN KEY ("first_user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "direct_conversations_second_user_id_users_id_fk" FOREIGN KEY ("second_user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "direct_conversations_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE cascade,
  CONSTRAINT "direct_conversations_order_check" CHECK ("first_user_id" < "second_user_id"),
  CONSTRAINT "direct_conversations_status_check" CHECK ("status" IN ('pending', 'accepted', 'declined'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "direct_conversations_first_idx" ON "direct_conversations" ("first_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "direct_conversations_second_idx" ON "direct_conversations" ("second_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "direct_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "conversation_id" integer NOT NULL,
  "sender_id" integer NOT NULL,
  "body" text NOT NULL,
  "is_admin_message" boolean DEFAULT false NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "direct_messages_conversation_id_direct_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."direct_conversations"("id") ON DELETE cascade,
  CONSTRAINT "direct_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "direct_messages_conversation_idx" ON "direct_messages" ("conversation_id");

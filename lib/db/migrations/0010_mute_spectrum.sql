ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "seating_layout" jsonb;--> statement-breakpoint
ALTER TABLE "class_members" ADD COLUMN IF NOT EXISTS "seat_desk_id" text;--> statement-breakpoint
ALTER TABLE "class_members" ADD COLUMN IF NOT EXISTS "seat_position" integer;
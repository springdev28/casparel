ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "seating_rows" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "seating_columns" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "class_members" ADD COLUMN IF NOT EXISTS "teacher_note" text;--> statement-breakpoint
ALTER TABLE "class_members" ADD COLUMN IF NOT EXISTS "seat_row" integer;--> statement-breakpoint
ALTER TABLE "class_members" ADD COLUMN IF NOT EXISTS "seat_column" integer;

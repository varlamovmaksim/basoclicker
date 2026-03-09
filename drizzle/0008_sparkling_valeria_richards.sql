ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" varchar(128);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" varchar(128);

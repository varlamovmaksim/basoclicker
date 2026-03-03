ALTER TABLE "boosters" ADD COLUMN IF NOT EXISTS "max_level" integer DEFAULT 20 NOT NULL;
--> statement-breakpoint
ALTER TABLE "boosters" ADD COLUMN IF NOT EXISTS "level_effect_coefficient" numeric(10, 4) DEFAULT '1' NOT NULL;

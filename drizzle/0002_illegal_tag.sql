ALTER TABLE "users" ADD COLUMN "points_booster_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "energy_max_booster_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "energy_regen_booster_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auto_taps_booster_level" integer DEFAULT 0 NOT NULL;
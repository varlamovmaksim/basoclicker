-- Create boosters table
CREATE TABLE IF NOT EXISTS "boosters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" varchar(64) NOT NULL,
  "order_index" integer NOT NULL,
  "name" varchar(128) NOT NULL,
  "emoji" varchar(32) NOT NULL,
  "effect_amount" numeric(10, 4) NOT NULL,
  "base_price" bigint NOT NULL,
  "price_increase_coefficient" numeric(10, 4) NOT NULL,
  "unlock_after_previous" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "boosters_type_order_index_unique" UNIQUE("type", "order_index")
);
--> statement-breakpoint

-- Seed first booster per type (fixed UUIDs for backfill)
INSERT INTO "boosters" ("id", "type", "order_index", "name", "emoji", "effect_amount", "base_price", "price_increase_coefficient", "unlock_after_previous") VALUES
  ('11111111-1111-4111-a111-111111111111', 'energy_regen', 0, 'Faster Recharge', '⚡', 0.5, 200, 2, 0),
  ('22222222-2222-4222-a222-222222222222', 'points_per_tap', 0, 'Bigger Bite', '☝️', 0.25, 100, 2, 0),
  ('33333333-3333-4333-a333-333333333333', 'auto_points', 0, 'Agent Upgrade', '⏱️', 5, 250, 2, 0)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

-- Create user_booster_purchases table
CREATE TABLE IF NOT EXISTS "user_booster_purchases" (
  "user_id" uuid NOT NULL,
  "booster_id" uuid NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "user_booster_purchases_user_id_booster_id_pk" PRIMARY KEY("user_id","booster_id"),
  CONSTRAINT "user_booster_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "user_booster_purchases_booster_id_boosters_id_fk" FOREIGN KEY ("booster_id") REFERENCES "public"."boosters"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint

-- Backfill from old user booster columns (run once before columns are dropped)
INSERT INTO "user_booster_purchases" ("user_id", "booster_id", "count")
SELECT id, '11111111-1111-4111-a111-111111111111', GREATEST(0, energy_regen_booster_level) FROM "users"
ON CONFLICT ("user_id", "booster_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "user_booster_purchases" ("user_id", "booster_id", "count")
SELECT id, '22222222-2222-4222-a222-222222222222', GREATEST(0, points_booster_level) FROM "users"
ON CONFLICT ("user_id", "booster_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "user_booster_purchases" ("user_id", "booster_id", "count")
SELECT id, '33333333-3333-4333-a333-333333333333', GREATEST(0, auto_taps_booster_level) FROM "users"
ON CONFLICT ("user_id", "booster_id") DO NOTHING;
--> statement-breakpoint

-- Drop old booster columns from users
ALTER TABLE "users" DROP COLUMN IF EXISTS "points_booster_level";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "energy_max_booster_level";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "energy_regen_booster_level";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "auto_taps_booster_level";

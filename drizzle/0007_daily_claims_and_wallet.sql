-- Add wallet address to users (for daily claim linking)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "wallet_address" varchar(42);
--> statement-breakpoint
-- Daily claims: one row per successful daily claim, tx_hash unique to prevent reuse
CREATE TABLE IF NOT EXISTS "daily_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tx_hash" varchar(66) NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_claims" ADD CONSTRAINT "daily_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_claims_tx_hash_unique" ON "daily_claims" USING btree ("tx_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_claims_user_id_claimed_at_idx" ON "daily_claims" USING btree ("user_id", "claimed_at");

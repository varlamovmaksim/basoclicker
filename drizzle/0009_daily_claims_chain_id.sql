-- Add chain_id to daily_claims (required by schema; existing rows get default 1)
ALTER TABLE "daily_claims" ADD COLUMN IF NOT EXISTS "chain_id" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
DROP INDEX IF EXISTS "daily_claims_tx_hash_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_claims_tx_hash_chain_id_unique" ON "daily_claims" USING btree ("tx_hash", "chain_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "daily_claims_user_id_claimed_at_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_claims_user_id_chain_id_claimed_at_idx" ON "daily_claims" USING btree ("user_id", "chain_id", "claimed_at");

-- Referral columns on users: own code + used code
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "referral_code" varchar(16);

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "used_referral_code" varchar(16);

CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_code_unique"
ON "users" ("referral_code");


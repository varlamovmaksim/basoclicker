UPDATE "users"
SET "wallet_address" = lower("wallet_address")
WHERE "wallet_address" IS NOT NULL
  AND "wallet_address" <> lower("wallet_address");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_fids" (
  "user_id" uuid NOT NULL,
  "fid" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_fids_user_id_fid_pk" PRIMARY KEY("user_id","fid"),
  CONSTRAINT "user_fids_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_fids_fid_unique" ON "user_fids" USING btree ("fid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_fids_user_id_idx" ON "user_fids" USING btree ("user_id");
--> statement-breakpoint
INSERT INTO "user_fids" ("user_id", "fid", "created_at")
SELECT "id", "fid", "created_at"
FROM "users"
WHERE "fid" IS NOT NULL
ON CONFLICT ("fid") DO NOTHING;
--> statement-breakpoint
CREATE TEMP TABLE "duplicate_user_map" AS
WITH ranked AS (
  SELECT
    "id",
    "wallet_address",
    "created_at",
    first_value("id") OVER (
      PARTITION BY "wallet_address"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS "canonical_id"
  FROM "users"
  WHERE "wallet_address" IS NOT NULL
    AND "wallet_address" <> ''
)
SELECT
  "id" AS "duplicate_id",
  "canonical_id"
FROM ranked
WHERE "id" <> "canonical_id";
--> statement-breakpoint
CREATE TEMP TABLE "user_merge_groups" AS
SELECT DISTINCT
  "canonical_id",
  "canonical_id" AS "member_id"
FROM "duplicate_user_map"
UNION ALL
SELECT
  "canonical_id",
  "duplicate_id" AS "member_id"
FROM "duplicate_user_map";
--> statement-breakpoint
INSERT INTO "user_booster_purchases" ("user_id", "booster_id", "count")
SELECT
  dum."canonical_id",
  ubp."booster_id",
  SUM(ubp."count")::integer
FROM "user_booster_purchases" ubp
JOIN "duplicate_user_map" dum ON dum."duplicate_id" = ubp."user_id"
GROUP BY dum."canonical_id", ubp."booster_id"
ON CONFLICT ("user_id", "booster_id") DO UPDATE
SET "count" = "user_booster_purchases"."count" + EXCLUDED."count";
--> statement-breakpoint
DELETE FROM "user_booster_purchases" ubp
USING "duplicate_user_map" dum
WHERE ubp."user_id" = dum."duplicate_id";
--> statement-breakpoint
UPDATE "sessions" s
SET "user_id" = dum."canonical_id"
FROM "duplicate_user_map" dum
WHERE s."user_id" = dum."duplicate_id";
--> statement-breakpoint
UPDATE "daily_claims" dc
SET "user_id" = dum."canonical_id"
FROM "duplicate_user_map" dum
WHERE dc."user_id" = dum."duplicate_id";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'tap_commits'
  ) THEN
    EXECUTE '
      UPDATE "tap_commits" tc
      SET "user_id" = dum."canonical_id"
      FROM "duplicate_user_map" dum
      WHERE tc."user_id" = dum."duplicate_id"
    ';
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO "user_fids" ("user_id", "fid", "created_at")
SELECT
  dum."canonical_id",
  uf."fid",
  uf."created_at"
FROM "user_fids" uf
JOIN "duplicate_user_map" dum ON dum."duplicate_id" = uf."user_id"
ON CONFLICT ("fid") DO NOTHING;
--> statement-breakpoint
WITH aggregated AS (
  SELECT
    umg."canonical_id",
    SUM(u."balance")::bigint AS "balance",
    MAX(u."energy")::bigint AS "energy",
    MAX(u."last_energy_at") AS "last_energy_at",
    MAX(u."last_commit_at") AS "last_commit_at",
    MAX(u."last_seq")::bigint AS "last_seq",
    MAX(u."avg_tps")::bigint AS "avg_tps",
    MIN(u."created_at") AS "created_at"
  FROM "user_merge_groups" umg
  JOIN "users" u ON u."id" = umg."member_id"
  GROUP BY umg."canonical_id"
)
UPDATE "users" u
SET
  "balance" = aggregated."balance",
  "energy" = aggregated."energy",
  "last_energy_at" = aggregated."last_energy_at",
  "last_commit_at" = aggregated."last_commit_at",
  "last_seq" = aggregated."last_seq",
  "avg_tps" = aggregated."avg_tps",
  "created_at" = aggregated."created_at",
  "username" = COALESCE(
    u."username",
    (
      SELECT u2."username"
      FROM "user_merge_groups" umg2
      JOIN "users" u2 ON u2."id" = umg2."member_id"
      WHERE umg2."canonical_id" = u."id"
        AND u2."username" IS NOT NULL
      ORDER BY
        CASE WHEN u2."id" = u."id" THEN 0 ELSE 1 END,
        u2."created_at" DESC,
        u2."id" ASC
      LIMIT 1
    )
  ),
  "display_name" = COALESCE(
    u."display_name",
    (
      SELECT u2."display_name"
      FROM "user_merge_groups" umg2
      JOIN "users" u2 ON u2."id" = umg2."member_id"
      WHERE umg2."canonical_id" = u."id"
        AND u2."display_name" IS NOT NULL
      ORDER BY
        CASE WHEN u2."id" = u."id" THEN 0 ELSE 1 END,
        u2."created_at" DESC,
        u2."id" ASC
      LIMIT 1
    )
  ),
  "referral_code" = COALESCE(
    u."referral_code",
    (
      SELECT u2."referral_code"
      FROM "user_merge_groups" umg2
      JOIN "users" u2 ON u2."id" = umg2."member_id"
      WHERE umg2."canonical_id" = u."id"
        AND u2."referral_code" IS NOT NULL
      ORDER BY
        CASE WHEN u2."id" = u."id" THEN 0 ELSE 1 END,
        u2."created_at" DESC,
        u2."id" ASC
      LIMIT 1
    )
  ),
  "used_referral_code" = COALESCE(
    u."used_referral_code",
    (
      SELECT u2."used_referral_code"
      FROM "user_merge_groups" umg2
      JOIN "users" u2 ON u2."id" = umg2."member_id"
      WHERE umg2."canonical_id" = u."id"
        AND u2."used_referral_code" IS NOT NULL
      ORDER BY
        CASE WHEN u2."id" = u."id" THEN 0 ELSE 1 END,
        u2."created_at" DESC,
        u2."id" ASC
      LIMIT 1
    )
  )
FROM aggregated
WHERE u."id" = aggregated."canonical_id";
--> statement-breakpoint
DELETE FROM "users" u
USING "duplicate_user_map" dum
WHERE u."id" = dum."duplicate_id";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_wallet_address_unique" ON "users" USING btree ("wallet_address");
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "fid";

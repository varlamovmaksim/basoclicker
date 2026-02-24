CREATE TYPE "public"."abuse_level" AS ENUM('none', 'low', 'medium', 'high');--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_fingerprint" varchar(128),
	"commit_count" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tap_commits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"requested_taps" bigint NOT NULL,
	"applied_taps" bigint NOT NULL,
	"max_allowed" bigint NOT NULL,
	"ratio" numeric(10, 4),
	"abuse_level" "abuse_level",
	"server_time" timestamp with time zone NOT NULL,
	"client_duration_ms" bigint
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fid" varchar(64) NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"last_commit_at" timestamp with time zone,
	"last_seq" bigint DEFAULT 0 NOT NULL,
	"avg_tps" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_fid_unique" UNIQUE("fid")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tap_commits" ADD CONSTRAINT "tap_commits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
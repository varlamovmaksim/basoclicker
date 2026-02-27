ALTER TABLE "users" ADD COLUMN "energy" bigint DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_energy_at" timestamp with time zone;
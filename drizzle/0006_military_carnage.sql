CREATE INDEX IF NOT EXISTS "sessions_user_id_started_at_idx" ON "sessions" USING btree ("user_id", "started_at");

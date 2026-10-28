CREATE TABLE IF NOT EXISTS "backup_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "bytes" bigint,
  "sha256" text,
  "error" text
);
CREATE INDEX IF NOT EXISTS "backup_runs_user_started_idx" ON "backup_runs" ("user_id", "started_at");

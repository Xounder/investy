CREATE TABLE IF NOT EXISTS "snapshot_backfill_progress" (
  "portfolio_id" text PRIMARY KEY NOT NULL REFERENCES "portfolios"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "last_date" varchar(10) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "snapshot_backfill_progress_user_idx" ON "snapshot_backfill_progress" ("user_id");

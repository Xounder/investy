CREATE TABLE IF NOT EXISTS "erasure_tombstones" (
  "user_id" text PRIMARY KEY NOT NULL,
  "erased_at" timestamp with time zone DEFAULT now() NOT NULL
);

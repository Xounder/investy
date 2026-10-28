ALTER TABLE "erasure_tombstones" ADD COLUMN IF NOT EXISTS "cleanup_pending" boolean DEFAULT true NOT NULL;

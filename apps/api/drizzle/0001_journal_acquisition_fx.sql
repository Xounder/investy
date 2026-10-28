ALTER TABLE "transactions" ADD COLUMN "currency" varchar(3) DEFAULT 'BRL' NOT NULL;
ALTER TABLE "transactions" ADD COLUMN "fx_rate_to_brl" bigint;
-- Legacy foreign entries must not be replayed as BRL. Recover the ORIGINAL
-- acquisition rates for every monetary event in an account+asset journal and
-- submit them together through POST /api/v1/transactions/repair-fx. Until then
-- writes for that holding fail with JOURNAL and list all missing transaction IDs.
-- Never backfill from a live quote: it cannot reconstruct the trade-date rate.
UPDATE "transactions" AS t SET "currency" = a."currency"
FROM "assets" AS a WHERE t."asset_id" = a."id" AND a."currency" <> 'BRL';

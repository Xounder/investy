-- Only internally posted receipts use this association. Legacy notes are untrusted;
-- paid historical rows remain unlinked and require explicit reconciliation.
ALTER TABLE "transactions" ADD COLUMN "dividend_id" text;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_dividend_id_dividends_id_fk"
  FOREIGN KEY ("dividend_id") REFERENCES "public"."dividends"("id") ON DELETE cascade;
CREATE UNIQUE INDEX "transactions_dividend_account_idx" ON "transactions" ("dividend_id", "account_id");

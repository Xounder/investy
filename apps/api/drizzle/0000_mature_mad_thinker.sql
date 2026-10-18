CREATE TYPE "public"."asset_class" AS ENUM('acao', 'fii', 'etf', 'etf_us', 'etf_ie', 'bdr', 'crypto', 'rf', 'tesouro', 'indice');--> statement-breakpoint
CREATE TYPE "public"."dividend_kind" AS ENUM('dividend', 'jcp', 'rendimento', 'amortizacao');--> statement-breakpoint
CREATE TYPE "public"."dividend_source" AS ENUM('provider', 'manual');--> statement-breakpoint
CREATE TYPE "public"."dividend_status" AS ENUM('expected', 'confirmed', 'paid');--> statement-breakpoint
CREATE TYPE "public"."nota_status" AS ENUM('pending', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('buy', 'sell', 'split', 'bonificacao', 'jcp', 'amortizacao', 'adjustment', 'opening');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"broker_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"account_number" varchar(60),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"name" varchar(160) NOT NULL,
	"class" "asset_class" NOT NULL,
	"sector" varchar(80),
	"currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"provider_key" varchar(40),
	"isin" varchar(12),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_series" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"value" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brokers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"code" varchar(40),
	"url" varchar(255),
	"is_seeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dividends" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"kind" "dividend_kind" NOT NULL,
	"ex_date" timestamp with time zone NOT NULL,
	"payment_date" timestamp with time zone,
	"rate_cents_per_unit" bigint NOT NULL,
	"status" "dividend_status" DEFAULT 'expected' NOT NULL,
	"source" "dividend_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"qty" bigint DEFAULT 0 NOT NULL,
	"avg_price_cents" bigint DEFAULT 0 NOT NULL,
	"cost_basis_cents" bigint DEFAULT 0 NOT NULL,
	"realized_pnl_cents" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nota_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"broker_id" text NOT NULL,
	"nota_number" varchar(40) NOT NULL,
	"trade_date" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "nota_status" DEFAULT 'pending' NOT NULL,
	"import_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"total_value_cents" bigint NOT NULL,
	"cost_basis_cents" bigint NOT NULL,
	"allocation_jsonb" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"price_cents" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"price_cents" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"fx_rate_to_brl" bigint,
	"source" varchar(40) NOT NULL,
	"is_stale" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"account_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"type" "transaction_type" NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"qty" bigint NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"fee_cents" bigint DEFAULT 0 NOT NULL,
	"realized_pnl_cents" bigint DEFAULT 0 NOT NULL,
	"factor" integer,
	"amort_rate_cents" bigint,
	"source" varchar(30) DEFAULT 'manual' NOT NULL,
	"nota_ref_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_imports" ADD CONSTRAINT "nota_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nota_imports" ADD CONSTRAINT "nota_imports_broker_id_brokers_id_fk" FOREIGN KEY ("broker_id") REFERENCES "public"."brokers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_overrides" ADD CONSTRAINT "quote_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_overrides" ADD CONSTRAINT "quote_overrides_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "accounts_portfolio_id_idx" ON "accounts" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "accounts_broker_id_idx" ON "accounts" USING btree ("broker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_symbol_idx" ON "assets" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "assets_class_idx" ON "assets" USING btree ("class");--> statement-breakpoint
CREATE INDEX "assets_currency_idx" ON "assets" USING btree ("currency");--> statement-breakpoint
CREATE UNIQUE INDEX "benchmark_series_symbol_date_idx" ON "benchmark_series" USING btree ("symbol","date");--> statement-breakpoint
CREATE INDEX "benchmark_series_symbol_idx" ON "benchmark_series" USING btree ("symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "brokers_code_idx" ON "brokers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "dividends_user_id_idx" ON "dividends" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dividends_asset_id_idx" ON "dividends" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "dividends_ex_date_idx" ON "dividends" USING btree ("ex_date");--> statement-breakpoint
CREATE INDEX "dividends_user_exdate_idx" ON "dividends" USING btree ("user_id","ex_date");--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_account_asset_idx" ON "holdings" USING btree ("account_id","asset_id");--> statement-breakpoint
CREATE INDEX "holdings_user_id_idx" ON "holdings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nota_imports_user_broker_number_date_idx" ON "nota_imports" USING btree ("user_id","broker_id","nota_number","trade_date");--> statement-breakpoint
CREATE INDEX "nota_imports_user_id_idx" ON "nota_imports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "portfolio_snapshots_user_id_idx" ON "portfolio_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_snapshots_portfolio_date_idx" ON "portfolio_snapshots" USING btree ("portfolio_id","date");--> statement-breakpoint
CREATE INDEX "portfolios_user_id_idx" ON "portfolios" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "portfolios_user_default_idx" ON "portfolios" USING btree ("user_id","is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_overrides_user_asset_idx" ON "quote_overrides" USING btree ("user_id","asset_id");--> statement-breakpoint
CREATE INDEX "quote_overrides_user_id_idx" ON "quote_overrides" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quotes_asset_id_idx" ON "quotes" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "quotes_asset_fetched_idx" ON "quotes" USING btree ("asset_id","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "transactions_user_id_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_portfolio_id_idx" ON "transactions" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "transactions_account_id_idx" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "transactions_asset_id_idx" ON "transactions" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "transactions_date_idx" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transactions_account_date_idx" ON "transactions" USING btree ("account_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
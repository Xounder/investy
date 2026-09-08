/**
 * Drizzle schema for Investy (apps/api).
 *
 * Covers all V1 entities (ADR-004): User, Session, Portfolio, Broker,
 * Account, Asset, Transaction, Dividend, Quote, QuoteOverride, Holding,
 * PortfolioSnapshot, BenchmarkSeries, NotaImport.
 *
 * Conventions:
 *  - All money stored as BIGINT integer cents (ADR-004).
 *  - All timestamps are UTC; America/Sao_Paulo applied at presentation.
 *  - Every user-owned row carries userId scope enforced at the repository
 *    layer (ADR-006).
 */
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// AssetClass values (duplicated from @investy/domain for schema independence)
const ASSET_CLASSES = [
  'acao',
  'fii',
  'etf',
  'etf_us',
  'etf_ie',
  'bdr',
  'crypto',
  'rf',
  'tesouro',
  'indice',
] as const;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const transactionTypeEnum = pgEnum('transaction_type', [
  'buy',
  'sell',
  'split',
  'bonificacao',
  'jcp',
  'amortizacao',
  'adjustment',
  'opening',
]);

export const dividendKindEnum = pgEnum('dividend_kind', [
  'dividend',
  'jcp',
  'rendimento',
  'amortizacao',
]);

export const assetClassEnum = pgEnum('asset_class', ASSET_CLASSES);

export const dividendStatusEnum = pgEnum('dividend_status', [
  'expected',
  'confirmed',
  'paid',
]);

export const dividendSourceEnum = pgEnum('dividend_source', [
  'provider',
  'manual',
]);

export const notaStatusEnum = pgEnum('nota_status', ['pending', 'confirmed']);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    name: varchar('name', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_idx').on(t.token),
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

export const portfolios = pgTable(
  'portfolios',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    currency: varchar('currency', { length: 3 }).notNull().default('BRL'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('portfolios_user_id_idx').on(t.userId),
    index('portfolios_user_default_idx').on(t.userId, t.isDefault),
  ],
);

export const brokers = pgTable(
  'brokers',
  {
    id: text('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    code: varchar('code', { length: 40 }),
    url: varchar('url', { length: 255 }),
    isSeeded: boolean('is_seeded').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('brokers_code_idx').on(t.code)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    portfolioId: text('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    brokerId: text('broker_id')
      .notNull()
      .references(() => brokers.id),
    name: varchar('name', { length: 120 }).notNull(),
    accountNumber: varchar('account_number', { length: 60 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('accounts_user_id_idx').on(t.userId),
    index('accounts_portfolio_id_idx').on(t.portfolioId),
    index('accounts_broker_id_idx').on(t.brokerId),
  ],
);

export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey(),
    symbol: varchar('symbol', { length: 20 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    class: assetClassEnum('class').notNull(),
    sector: varchar('sector', { length: 80 }),
    currency: varchar('currency', { length: 3 }).notNull().default('BRL'),
    providerKey: varchar('provider_key', { length: 40 }),
    isin: varchar('isin', { length: 12 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('assets_symbol_idx').on(t.symbol),
    index('assets_class_idx').on(t.class),
    index('assets_currency_idx').on(t.currency),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    portfolioId: text('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id),
    type: transactionTypeEnum('type').notNull(),
    date: timestamp('date', { withTimezone: true }).notNull(),
    qty: bigint('qty', { mode: 'bigint' }).notNull(),
    unitPriceCents: bigint('unit_price_cents', { mode: 'bigint' }).notNull(),
    feeCents: bigint('fee_cents', { mode: 'bigint' }).notNull().default(0n),
    realizedPnlCents: bigint('realized_pnl_cents', { mode: 'bigint' }).notNull().default(0n),
    factor: integer('factor'),
    amortRateCents: bigint('amort_rate_cents', { mode: 'bigint' }),
    source: varchar('source', { length: 30 }).notNull().default('manual'),
    notaRefId: text('nota_ref_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('transactions_user_id_idx').on(t.userId),
    index('transactions_portfolio_id_idx').on(t.portfolioId),
    index('transactions_account_id_idx').on(t.accountId),
    index('transactions_asset_id_idx').on(t.assetId),
    index('transactions_date_idx').on(t.date),
    index('transactions_account_date_idx').on(t.accountId, t.date),
  ],
);

export const dividends = pgTable(
  'dividends',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    portfolioId: text('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id),
    kind: dividendKindEnum('kind').notNull(),
    exDate: timestamp('ex_date', { withTimezone: true }).notNull(),
    paymentDate: timestamp('payment_date', { withTimezone: true }),
    rateCentsPerUnit: bigint('rate_cents_per_unit', { mode: 'bigint' }).notNull(),
    status: dividendStatusEnum('status').notNull().default('expected'),
    source: dividendSourceEnum('source').notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('dividends_user_id_idx').on(t.userId),
    index('dividends_asset_id_idx').on(t.assetId),
    index('dividends_ex_date_idx').on(t.exDate),
    index('dividends_user_exdate_idx').on(t.userId, t.exDate),
  ],
);

export const quotes = pgTable(
  'quotes',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    priceCents: bigint('price_cents', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('BRL'),
    fxRateToBRL: bigint('fx_rate_to_brl', { mode: 'bigint' }),
    source: varchar('source', { length: 40 }).notNull(),
    isStale: boolean('is_stale').notNull().default(false),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('quotes_asset_id_idx').on(t.assetId),
    index('quotes_asset_fetched_idx').on(t.assetId, t.fetchedAt),
  ],
);

export const quoteOverrides = pgTable(
  'quote_overrides',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id),
    priceCents: bigint('price_cents', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('BRL'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('quote_overrides_user_asset_idx').on(t.userId, t.assetId),
    index('quote_overrides_user_id_idx').on(t.userId),
  ],
);

export const holdings = pgTable(
  'holdings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id),
    qty: bigint('qty', { mode: 'bigint' }).notNull().default(0n),
    avgPriceCents: bigint('avg_price_cents', { mode: 'bigint' }).notNull().default(0n),
    costBasisCents: bigint('cost_basis_cents', { mode: 'bigint' }).notNull().default(0n),
    realizedPnlCents: bigint('realized_pnl_cents', { mode: 'bigint' }).notNull().default(0n),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('holdings_account_asset_idx').on(t.accountId, t.assetId),
    index('holdings_user_id_idx').on(t.userId),
  ],
);

export const portfolioSnapshots = pgTable(
  'portfolio_snapshots',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    portfolioId: text('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    date: timestamp('date', { withTimezone: true }).notNull(),
    totalValueCents: bigint('total_value_cents', { mode: 'bigint' }).notNull(),
    costBasisCents: bigint('cost_basis_cents', { mode: 'bigint' }).notNull(),
    allocationJsonb: jsonb('allocation_jsonb'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('portfolio_snapshots_user_id_idx').on(t.userId),
    uniqueIndex('portfolio_snapshots_portfolio_date_idx').on(
      t.portfolioId,
      t.date,
    ),
  ],
);

export const benchmarkSeries = pgTable(
  'benchmark_series',
  {
    id: text('id').primaryKey(),
    symbol: varchar('symbol', { length: 20 }).notNull(),
    date: timestamp('date', { withTimezone: true }).notNull(),
    value: bigint('value', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('benchmark_series_symbol_date_idx').on(t.symbol, t.date),
    index('benchmark_series_symbol_idx').on(t.symbol),
  ],
);

export const notaimports = pgTable(
  'nota_imports',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    brokerId: text('broker_id')
      .notNull()
      .references(() => brokers.id),
    notaNumber: varchar('nota_number', { length: 40 }).notNull(),
    tradeDate: timestamp('trade_date', { withTimezone: true }).notNull(),
    payload: jsonb('payload').notNull(),
    status: notaStatusEnum('status').notNull().default('pending'),
    importHash: varchar('import_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('nota_imports_user_broker_number_date_idx').on(
      t.userId,
      t.brokerId,
      t.notaNumber,
      t.tradeDate,
    ),
    index('nota_imports_user_id_idx').on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  portfolios: many(portfolios),
  accounts: many(accounts),
  transactions: many(transactions),
  dividends: many(dividends),
  quoteOverrides: many(quoteOverrides),
  holdings: many(holdings),
  portfolioSnapshots: many(portfolioSnapshots),
  notaimports: many(notaimports),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
  user: one(users, {
    fields: [portfolios.userId],
    references: [users.id],
  }),
  accounts: many(accounts),
  transactions: many(transactions),
  dividends: many(dividends),
  portfolioSnapshots: many(portfolioSnapshots),
}));

export const brokersRelations = relations(brokers, ({ many }) => ({
  accounts: many(accounts),
  notaimports: many(notaimports),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
  portfolio: one(portfolios, {
    fields: [accounts.portfolioId],
    references: [portfolios.id],
  }),
  broker: one(brokers, {
    fields: [accounts.brokerId],
    references: [brokers.id],
  }),
  transactions: many(transactions),
  holdings: many(holdings),
}));

export const assetsRelations = relations(assets, ({ many }) => ({
  transactions: many(transactions),
  dividends: many(dividends),
  quotes: many(quotes),
  quoteOverrides: many(quoteOverrides),
  holdings: many(holdings),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  portfolio: one(portfolios, {
    fields: [transactions.portfolioId],
    references: [portfolios.id],
  }),
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  asset: one(assets, {
    fields: [transactions.assetId],
    references: [assets.id],
  }),
}));

export const dividendsRelations = relations(dividends, ({ one }) => ({
  user: one(users, {
    fields: [dividends.userId],
    references: [users.id],
  }),
  portfolio: one(portfolios, {
    fields: [dividends.portfolioId],
    references: [portfolios.id],
  }),
  asset: one(assets, {
    fields: [dividends.assetId],
    references: [assets.id],
  }),
}));

export const quotesRelations = relations(quotes, ({ one }) => ({
  asset: one(assets, {
    fields: [quotes.assetId],
    references: [assets.id],
  }),
}));

export const quoteOverridesRelations = relations(quoteOverrides, ({ one }) => ({
  user: one(users, {
    fields: [quoteOverrides.userId],
    references: [users.id],
  }),
  asset: one(assets, {
    fields: [quoteOverrides.assetId],
    references: [assets.id],
  }),
}));

export const holdingsRelations = relations(holdings, ({ one }) => ({
  user: one(users, {
    fields: [holdings.userId],
    references: [users.id],
  }),
  account: one(accounts, {
    fields: [holdings.accountId],
    references: [accounts.id],
  }),
  asset: one(assets, {
    fields: [holdings.assetId],
    references: [assets.id],
  }),
}));

export const portfolioSnapshotsRelations = relations(
  portfolioSnapshots,
  ({ one }) => ({
    user: one(users, {
      fields: [portfolioSnapshots.userId],
      references: [users.id],
    }),
    portfolio: one(portfolios, {
      fields: [portfolioSnapshots.portfolioId],
      references: [portfolios.id],
    }),
  }),
);

export const notaimportsRelations = relations(notaimports, ({ one }) => ({
  user: one(users, {
    fields: [notaimports.userId],
    references: [users.id],
  }),
  broker: one(brokers, {
    fields: [notaimports.brokerId],
    references: [brokers.id],
  }),
}));

// ---------------------------------------------------------------------------
// Types exported for consumers
// ---------------------------------------------------------------------------

export type UserTable = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SessionTable = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type PortfolioTable = typeof portfolios.$inferSelect;
export type NewPortfolio = typeof portfolios.$inferInsert;
export type BrokerTable = typeof brokers.$inferSelect;
export type NewBroker = typeof brokers.$inferInsert;
export type AccountTable = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type AssetTable = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type TransactionTable = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type DividendTable = typeof dividends.$inferSelect;
export type NewDividend = typeof dividends.$inferInsert;
export type QuoteTable = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;
export type QuoteOverrideTable = typeof quoteOverrides.$inferSelect;
export type NewQuoteOverride = typeof quoteOverrides.$inferInsert;
export type HoldingTable = typeof holdings.$inferSelect;
export type NewHolding = typeof holdings.$inferInsert;
export type PortfolioSnapshotTable = typeof portfolioSnapshots.$inferSelect;
export type NewPortfolioSnapshot = typeof portfolioSnapshots.$inferInsert;
export type BenchmarkSeriesTable = typeof benchmarkSeries.$inferSelect;
export type NewBenchmarkSeries = typeof benchmarkSeries.$inferInsert;
export type NotaImportTable = typeof notaimports.$inferSelect;
export type NewNotaImport = typeof notaimports.$inferInsert;
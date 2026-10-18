/**
 * Drizzle schema — market catalog entities (Asset, Quote, QuoteOverride,
 * BenchmarkSeries).
 *
 * Split out of the monolithic schema module (TASK-04 VERIFY 4) so every schema
 * file stays under the 400-line project limit.
 */
import {
  bigint,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './auth.js';
import { assetClassEnum } from './enums.js';

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

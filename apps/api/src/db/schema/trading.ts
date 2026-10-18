/**
 * Drizzle schema — trading entities (Transaction, Dividend, Holding).
 *
 * Split out of the monolithic schema module (TASK-04 VERIFY 4) so every schema
 * file stays under the 400-line project limit.
 */
import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './auth.js';
import { assets } from './catalog.js';
import {
  dividendKindEnum,
  dividendSourceEnum,
  dividendStatusEnum,
  transactionTypeEnum,
} from './enums.js';
import { accounts, portfolios } from './portfolio.js';

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

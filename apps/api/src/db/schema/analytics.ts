/**
 * Drizzle schema — analytics and import entities (PortfolioSnapshot,
 * NotaImport).
 *
 * Split out of the monolithic schema module (TASK-04 VERIFY 4) so every schema
 * file stays under the 400-line project limit.
 */
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './auth.js';
import { notaStatusEnum } from './enums.js';
import { brokers, portfolios } from './portfolio.js';

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

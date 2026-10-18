/**
 * Drizzle schema — portfolio structure entities (Portfolio, Broker, Account).
 *
 * Split out of the monolithic schema module (TASK-04 VERIFY 4) so every schema
 * file stays under the 400-line project limit.
 */
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './auth.js';

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

/**
 * Drizzle schema — relations.
 *
 * Split out of the monolithic schema module (TASK-04 VERIFY 4) so every schema
 * file stays under the 400-line project limit.
 */
import { relations } from 'drizzle-orm';

import { sessions, users } from './auth.js';
import { assets, quotes, quoteOverrides } from './catalog.js';
import { accounts, brokers, portfolios } from './portfolio.js';
import { dividends, holdings, transactions } from './trading.js';
import { notaimports, portfolioSnapshots } from './analytics.js';

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

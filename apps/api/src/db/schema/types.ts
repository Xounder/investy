/**
 * Drizzle schema — exported types.
 *
 * Split out of the monolithic schema module (TASK-04 VERIFY 4) so every schema
 * file stays under the 400-line project limit.
 */
import { accounts, brokers, portfolios } from './portfolio.js';
import { assets, benchmarkSeries, quoteOverrides, quotes } from './catalog.js';
import { dividends, holdings, transactions } from './trading.js';
import { notaimports, portfolioSnapshots } from './analytics.js';
import { sessions, users } from './auth.js';

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

import { index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { portfolios } from './portfolio.js';
import { users } from './auth.js';

/** Attempted observation date, not last successful snapshot: missing quotes cannot starve later days. */
export const snapshotBackfillProgress = pgTable('snapshot_backfill_progress', {
  portfolioId: text('portfolio_id').primaryKey().references(() => portfolios.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastDate: varchar('last_date', { length: 10 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('snapshot_backfill_progress_user_idx').on(t.userId)]);

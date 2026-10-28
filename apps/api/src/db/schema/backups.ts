import { bigint, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth.js';

/** Per-attempt metadata. Never expose the on-disk location to API consumers. */
export const backupRuns = pgTable('backup_runs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  bytes: bigint('bytes', { mode: 'bigint' }),
  sha256: text('sha256'),
  error: text('error'),
}, (t) => [index('backup_runs_user_started_idx').on(t.userId, t.startedAt)]);

import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Intentionally NO foreign key to users: survives hard deletion and prevents
// stale backup restores from recreating an erased identity.
export const erasureTombstones = pgTable('erasure_tombstones', {
  userId: text('user_id').primaryKey(),
  erasedAt: timestamp('erased_at', { withTimezone: true }).notNull().defaultNow(),
  cleanupPending: boolean('cleanup_pending').notNull().default(true),
});

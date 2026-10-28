/**
 * Ownership-scoped repository base layer (ADR-006).
 *
 * Every user-owned query MUST filter by userId. Cross-user access returns
 * empty results (404 at route level), never 403, to prevent enumeration.
 */
import { getDb } from '../db/client.js';
import type { InferSelectModel, InferInsertModel, SQL } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import { and, eq, getTableColumns } from 'drizzle-orm';

export interface ScopedRepository<TSelect> {
  /** Finds a single record by ID, scoped to the user. Returns null if not found or owned by another user. */
  findById(id: string, userId: string): Promise<TSelect | null>;
  /** Finds all records for the user, with optional additional conditions. */
  findAll(userId: string, ...conditions: SQL[]): Promise<TSelect[]>;
  /** Creates a new record with the userId automatically set. */
  create(data: Omit<TSelect, 'id' | 'createdAt'> & { id?: string }): Promise<TSelect>;
  /** Updates a record scoped to the user. Returns null if not found or owned by another user. */
  update(id: string, userId: string, data: Partial<TSelect>): Promise<TSelect | null>;
  /** Deletes a record scoped to the user. Returns true if deleted, false if not found or owned by another user. */
  delete(id: string, userId: string): Promise<boolean>;
}

/**
 * Creates a scoped repository for a user-owned table.
 * The table must have a `userId` column.
 */
export function createScopedRepository<
  TTable extends PgTable,
  TSelect extends InferSelectModel<TTable> & { userId: string; id: string },
  TInsert extends InferInsertModel<TTable>,
>(
  table: TTable,
  userIdColumn: PgColumn,
): ScopedRepository<TSelect> {
  const idColumn = getTableColumns(table).id as PgColumn;
  return {
    async findById(id: string, userId: string): Promise<TSelect | null> {
      const db = getDb();
      const results = await db
        .select()
        .from(table)
        .where(and(eq(userIdColumn, userId), eq(idColumn, id)))
        .limit(1);
      return (results[0] as TSelect) ?? null;
    },

    async findAll(userId: string, ...conditions: SQL[]): Promise<TSelect[]> {
      const db = getDb();
      const whereConditions = [eq(userIdColumn, userId), ...conditions];
      const results = await db.select().from(table).where(and(...whereConditions));
      return results as TSelect[];
    },

    async create(data: Omit<TSelect, 'id' | 'createdAt'> & { id?: string }): Promise<TSelect> {
      const db = getDb();
      const id = data.id ?? crypto.randomUUID();
      const values = { ...data, id } as unknown as TInsert;
      const [result] = await db.insert(table).values(values).returning();
      return result as TSelect;
    },

    async update(id: string, userId: string, data: Partial<TSelect>): Promise<TSelect | null> {
      const db = getDb();
      const results = await db
        .update(table)
        .set(data)
        .where(and(eq(userIdColumn, userId), eq(idColumn, id)))
        .returning();
      return ((results as TSelect[])[0]) ?? null;
    },

    async delete(id: string, userId: string): Promise<boolean> {
      const db = getDb();
      const result = await db
        .delete(table)
        .where(and(eq(userIdColumn, userId), eq(idColumn, id)));
      return (result.rowCount ?? 0) > 0;
    },
  };
}

export { and, eq };

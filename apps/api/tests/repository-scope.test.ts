import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the database client BEFORE importing any modules that use it
const fakeDb = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  returning: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  _results: [],
};

vi.mock('../src/db/client.js', () => ({
  getDb: vi.fn(() => fakeDb),
}));

import { createScopedRepository } from '../src/repositories/base.js';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { InferInsertModel } from 'drizzle-orm';

// Create a test table with userId column
const testTable = pgTable('test_table', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

type TestTableSelect = {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
};

type TestTableInsert = InferInsertModel<typeof testTable>;

// Chain objects for mocking Drizzle's fluent API
const selectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
};

const insertChain = {
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
};

const updateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
};

const deleteChain = {
  where: vi.fn().mockReturnThis(),
};

describe('Ownership-scoped repository', () => {
  let repo: ReturnType<typeof createScopedRepository<typeof testTable, TestTableSelect, TestTableInsert>>;

  beforeEach(() => {
    vi.clearAllMocks();

    fakeDb.select.mockReturnValue(selectChain);
    fakeDb.from.mockReturnValue(selectChain);
    selectChain.where.mockReturnValue(selectChain);
    selectChain.limit.mockReturnValue(selectChain);
    selectChain.returning.mockReturnValue(selectChain);

    fakeDb.insert.mockReturnValue(insertChain);
    insertChain.values.mockReturnValue(insertChain);
    insertChain.returning.mockReturnValue(insertChain);

    fakeDb.update.mockReturnValue(updateChain);
    updateChain.set.mockReturnValue(updateChain);
    updateChain.where.mockReturnValue(updateChain);
    updateChain.returning.mockReturnValue(updateChain);

    fakeDb.delete.mockReturnValue(deleteChain);
    deleteChain.where.mockReturnValue(deleteChain);

    repo = createScopedRepository(testTable, testTable.userId);
  });

  it('findById includes userId in where clause', async () => {
    const mockResult = [{ id: '1', userId: 'user1', name: 'Test', createdAt: new Date() }];
    selectChain.limit.mockResolvedValue(mockResult);

    const result = await repo.findById('1', 'user1');

    expect(result).toEqual(mockResult[0]);
    expect(selectChain.where).toHaveBeenCalled();
  });

  it('findById returns null when not found', async () => {
    selectChain.limit.mockResolvedValue([]);

    const result = await repo.findById('1', 'user1');

    expect(result).toBeNull();
  });

  it('findAll includes userId in where clause', async () => {
    const mockResults = [
      { id: '1', userId: 'user1', name: 'Test1', createdAt: new Date() },
      { id: '2', userId: 'user1', name: 'Test2', createdAt: new Date() },
    ];
    selectChain.where.mockResolvedValue(mockResults);

    const results = await repo.findAll('user1');

    expect(results).toEqual(mockResults);
  });

  it('create sets id and includes userId', async () => {
    const mockResult = [{ id: 'new-id', userId: 'user1', name: 'New', createdAt: new Date() }];
    insertChain.returning.mockResolvedValue(mockResult);

    const result = await repo.create({ userId: 'user1', name: 'New' });

    expect(result).toEqual(mockResult[0]);
    expect(result.id).toBeDefined();
  });

  it('update includes userId in where clause', async () => {
    const mockResult = [{ id: '1', userId: 'user1', name: 'Updated', createdAt: new Date() }];
    updateChain.returning.mockResolvedValue(mockResult);

    const result = await repo.update('1', 'user1', { name: 'Updated' });

    expect(result).toEqual(mockResult[0]);
  });

  it('update returns null when not found or wrong user', async () => {
    updateChain.returning.mockResolvedValue([]);

    const result = await repo.update('1', 'user1', { name: 'Updated' });

    expect(result).toBeNull();
  });

  it('delete includes userId in where clause and returns true on success', async () => {
    deleteChain.where.mockResolvedValue({ rowCount: 1 });

    const result = await repo.delete('1', 'user1');

    expect(result).toBe(true);
  });

  it('delete returns false when not found or wrong user', async () => {
    deleteChain.where.mockResolvedValue({ rowCount: 0 });

    const result = await repo.delete('1', 'user1');

    expect(result).toBe(false);
  });
});
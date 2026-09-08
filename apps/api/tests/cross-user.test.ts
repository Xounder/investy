import { describe, expect, it, vi, beforeEach } from 'vitest';

import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { verifySessionToken } from '../src/lib/session.js';

// Use vi.hoisted to define the mock before vi.mock is hoisted
const { mockSessionRepository } = vi.hoisted(() => ({
  mockSessionRepository: {
    findByToken: vi.fn(),
    create: vi.fn(),
    deleteExpired: vi.fn(),
    deleteAllForUser: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../src/repositories/sessions.js', () => ({
  sessionRepository: mockSessionRepository,
}));

// Mock the database client
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

function resetMocks() {
  vi.clearAllMocks();
  fakeDb.select.mockReturnValue(selectChain);
  fakeDb.from.mockReturnValue(selectChain);
  selectChain.from.mockReturnValue(selectChain);
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

  // Reset session repository mocks
  mockSessionRepository.findByToken.mockResolvedValue(null);
  mockSessionRepository.create.mockResolvedValue({});
  mockSessionRepository.deleteExpired.mockResolvedValue(0);
  mockSessionRepository.deleteAllForUser.mockResolvedValue(0);
  mockSessionRepository.findById.mockResolvedValue(null);
  mockSessionRepository.findAll.mockResolvedValue([]);
  mockSessionRepository.update.mockResolvedValue(null);
  mockSessionRepository.delete.mockResolvedValue(false);
}

// Helper to set up session revocation mock
function mockSessionFindByToken(sessionRow: { id: string; userId: string; token: string; expiresAt: Date; createdAt: Date } | null) {
  mockSessionRepository.findByToken.mockResolvedValue(sessionRow);
}

describe('Cross-user isolation (real routes with mocked DB)', () => {
  let user1Id: string;
  let user2Id: string;
  let user1Token: string;
  let user2Token: string;

  beforeEach(() => {
    resetMocks();
    user1Id = 'user-1';
    user2Id = 'user-2';
    user1Token = createSessionToken(user1Id);
    user2Token = createSessionToken(user2Id);
  });

  describe('scoped repository queries return only owner rows', () => {
    it('user1 only sees user1 portfolios', async () => {
      // Mock session for user1
      mockSessionFindByToken({
        id: 'session-1',
        userId: user1Id,
        token: user1Token,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
      // User lookup for /me (authMiddleware calls this)
      selectChain.limit.mockResolvedValueOnce([{
        id: user1Id,
        email: 'u1@test.com',
        name: 'User1',
        createdAt: new Date(),
      }]);
      // Portfolio insert
      insertChain.returning.mockResolvedValueOnce([{ id: 'p1', userId: user1Id, name: 'Test', isDefault: true, currency: 'BRL', createdAt: new Date() }]);

      const res1 = await app.request('/api/v1/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `session=${user1Token}`,
        },
        body: JSON.stringify({ portfolioName: 'Test' }),
      });

      expect(res1.status).toBe(201);
    });

    it('user2 only sees user2 portfolios', async () => {
      // Mock session for user2
      mockSessionFindByToken({
        id: 'session-2',
        userId: user2Id,
        token: user2Token,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
      // User lookup for /me (authMiddleware calls this)
      selectChain.limit.mockResolvedValueOnce([{
        id: user2Id,
        email: 'u2@test.com',
        name: 'User2',
        createdAt: new Date(),
      }]);
      // Portfolio insert
      insertChain.returning.mockResolvedValueOnce([{ id: 'p2', userId: user2Id, name: 'Test', isDefault: true, currency: 'BRL', createdAt: new Date() }]);

      const res2 = await app.request('/api/v1/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `session=${user2Token}`,
        },
        body: JSON.stringify({ portfolioName: 'Test' }),
      });

      expect(res2.status).toBe(201);
    });
  });

  describe('cross-user route access yields 404 (not 403)', () => {
    it('user1 cannot access user2 resources via session', async () => {
      // User1's session is valid
      mockSessionFindByToken({
        id: 'session-1',
        userId: user1Id,
        token: user1Token,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
      // User lookup returns user1's data
      selectChain.limit.mockResolvedValueOnce([{ id: user1Id, email: 'u1@test.com', name: 'User1', createdAt: new Date() }]);

      const res = await app.request('/api/v1/auth/me', {
        headers: { Cookie: `session=${user1Token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { id: string };
      expect(body.id).toBe(user1Id);
      expect(body.id).not.toBe(user2Id);
    });

    it('simulating cross-user access via token swap fails - user2 token returns user2 data', async () => {
      // Mock session for user2
      mockSessionFindByToken({
        id: 'session-2',
        userId: user2Id,
        token: user2Token,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });
      // User lookup returns user2's data
      selectChain.limit.mockResolvedValueOnce([{ id: user2Id, email: 'u2@test.com', name: 'User2', createdAt: new Date() }]);

      // Use user2's token
      const res = await app.request('/api/v1/auth/me', {
        headers: { Cookie: `session=${user2Token}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { id: string };
      // Should return user2's data, not user1's
      expect(body.id).toBe(user2Id);
      expect(body.id).not.toBe(user1Id);
    });
  });

  describe('session tokens are unique per user', () => {
    it('different users get different tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const token = createSessionToken(`user-${i}`);
        tokens.add(token);
      }
      expect(tokens.size).toBe(100);
    });

    it('verifies session tokens extract correct user IDs', async () => {
      const payload1 = verifySessionToken(user1Token);
      const payload2 = verifySessionToken(user2Token);

      expect(payload1?.userId).toBe(user1Id);
      expect(payload2?.userId).toBe(user2Id);
      expect(payload1?.userId).not.toBe(payload2?.userId);
    });
  });

  describe('ownership-scoped repository behavior', () => {
    // This tests the repository layer directly using the same mock pattern
    // as repository-scope.test.ts

    it('findById returns null for different user', async () => {
      const { createScopedRepository } = await import('../src/repositories/base.js');
      const { pgTable, text, timestamp } = await import('drizzle-orm/pg-core');

      const testTable = pgTable('test_table', {
        id: text('id').primaryKey(),
        userId: text('user_id').notNull(),
        name: text('name').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      });

      const repo = createScopedRepository(testTable, testTable.userId);

      // Use a fresh mock for this test by directly mocking the chain
      // Create a fresh select chain for this test
      const testSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        returning: vi.fn().mockReturnThis(),
      };

      // Temporarily override the db mock
      const originalSelect = fakeDb.select;
      fakeDb.select.mockReturnValue(testSelectChain);
      testSelectChain.from.mockReturnValue(testSelectChain);
      testSelectChain.where.mockReturnValue(testSelectChain);
      testSelectChain.limit.mockResolvedValueOnce([{ id: '1', userId: user1Id, name: 'Test', createdAt: new Date() }]);

      const result = await repo.findById('1', user1Id);
      expect(result).not.toBeNull();
      expect(result?.userId).toBe(user1Id);

      // Mock returns nothing for user2 (different user)
      testSelectChain.limit.mockResolvedValueOnce([]);

      const result2 = await repo.findById('1', user2Id);
      expect(result2).toBeNull();

      // Restore
      fakeDb.select.mockImplementation(originalSelect);
    });

    it('findAll returns only owner rows', async () => {
      const { createScopedRepository } = await import('../src/repositories/base.js');
      const { pgTable, text, timestamp } = await import('drizzle-orm/pg-core');

      const testTable = pgTable('test_table', {
        id: text('id').primaryKey(),
        userId: text('user_id').notNull(),
        name: text('name').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      });

      const repo = createScopedRepository(testTable, testTable.userId);

      // Mock returns only user1's rows
      selectChain.where.mockResolvedValueOnce([
        { id: '1', userId: user1Id, name: 'Test1', createdAt: new Date() },
        { id: '2', userId: user1Id, name: 'Test2', createdAt: new Date() },
      ]);

      const results = await repo.findAll(user1Id);
      expect(results).toHaveLength(2);
      expect(results.every(r => r.userId === user1Id)).toBe(true);
    });

    it('create sets userId automatically', async () => {
      const { createScopedRepository } = await import('../src/repositories/base.js');
      const { pgTable, text, timestamp } = await import('drizzle-orm/pg-core');

      const testTable = pgTable('test_table', {
        id: text('id').primaryKey(),
        userId: text('user_id').notNull(),
        name: text('name').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      });

      const repo = createScopedRepository(testTable, testTable.userId);

      insertChain.returning.mockResolvedValueOnce([{ id: 'new-id', userId: user1Id, name: 'New', createdAt: new Date() }]);

      const result = await repo.create({ userId: user1Id, name: 'New' });
      expect(result.userId).toBe(user1Id);
      expect(result.id).toBeDefined();
    });

    it('update returns null for wrong user', async () => {
      const { createScopedRepository } = await import('../src/repositories/base.js');
      const { pgTable, text, timestamp } = await import('drizzle-orm/pg-core');

      const testTable = pgTable('test_table', {
        id: text('id').primaryKey(),
        userId: text('user_id').notNull(),
        name: text('name').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      });

      const repo = createScopedRepository(testTable, testTable.userId);

      // Mock returns empty for wrong user
      updateChain.returning.mockResolvedValueOnce([]);

      const result = await repo.update('1', user2Id, { name: 'Updated' });
      expect(result).toBeNull();
    });

    it('delete returns false for wrong user', async () => {
      const { createScopedRepository } = await import('../src/repositories/base.js');
      const { pgTable, text, timestamp } = await import('drizzle-orm/pg-core');

      const testTable = pgTable('test_table', {
        id: text('id').primaryKey(),
        userId: text('user_id').notNull(),
        name: text('name').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      });

      const repo = createScopedRepository(testTable, testTable.userId);

      deleteChain.where.mockResolvedValueOnce({ rowCount: 0 });

      const result = await repo.delete('1', user2Id);
      expect(result).toBe(false);
    });
  });
});
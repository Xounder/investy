import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { setUserOverride, clearUserOverride, resolveEffectiveQuote } from '../src/services/market-data/overrides.js';

// Mock the database client
const fakeDb = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  returning: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoUpdate: vi.fn(),
  delete: vi.fn(),
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
  onConflictDoUpdate: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
};

const deleteChain = {
  where: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
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
  insertChain.onConflictDoUpdate.mockReturnValue(insertChain);
  insertChain.set.mockReturnValue(insertChain);
  insertChain.where.mockReturnValue(insertChain);

  fakeDb.delete.mockReturnValue(deleteChain);
  deleteChain.where.mockReturnValue(deleteChain);
  deleteChain.returning.mockReturnValue(deleteChain);
}

describe('Quote overrides', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('override wins over cached quote', () => {
    it('returns override when it exists', async () => {
      const userId = 'user-1';
      const assetId = 'asset-1';
      const overridePrice = 5000n;

      // Mock override exists
      selectChain.limit.mockResolvedValueOnce([{
        id: 'override-1',
        userId,
        assetId,
        priceCents: overridePrice,
        currency: 'BRL',
        createdAt: new Date(),
      }]);

      const result = await resolveEffectiveQuote(userId, assetId, {
        priceCents: 3000n,
        currency: 'BRL',
        isStale: false,
      });

      expect(result).not.toBeNull();
      expect(result!.source).toBe('override');
      expect(result!.priceCents).toBe(overridePrice);
      expect(result!.isOverride).toBe(true);
      expect(result!.isStale).toBe(false);
    });

    it('falls back to cached quote when no override', async () => {
      const userId = 'user-1';
      const assetId = 'asset-1';

      // Mock no override
      selectChain.limit.mockResolvedValueOnce([]);

      const result = await resolveEffectiveQuote(userId, assetId, {
        priceCents: 3000n,
        currency: 'BRL',
        isStale: false,
      });

      expect(result).not.toBeNull();
      expect(result!.source).toBe('cache');
      expect(result!.priceCents).toBe(3000n);
      expect(result!.isOverride).toBe(false);
    });

    it('falls back to cached quote when user not authenticated', async () => {
      const assetId = 'asset-1';

      const result = await resolveEffectiveQuote(null, assetId, {
        priceCents: 3000n,
        currency: 'BRL',
        isStale: false,
      });

      expect(result).not.toBeNull();
      expect(result!.source).toBe('cache');
      expect(result!.priceCents).toBe(3000n);
      expect(result!.isOverride).toBe(false);
    });
  });

  describe('override cleared restores cached quote', () => {
    it('clears override and returns true', async () => {
      const userId = 'user-1';
      const assetId = 'asset-1';

      // Mock successful delete
      deleteChain.where.mockResolvedValueOnce({ rowCount: 1 });

      const result = await clearUserOverride(userId, assetId);

      expect(result).toBe(true);
      expect(deleteChain.where).toHaveBeenCalled();
    });

    it('returns false when no override to clear', async () => {
      const userId = 'user-1';
      const assetId = 'asset-1';

      // Mock no rows deleted
      deleteChain.where.mockResolvedValueOnce({ rowCount: 0 });

      const result = await clearUserOverride(userId, assetId);

      expect(result).toBe(false);
    });

    it('override cleared then cached quote is used', async () => {
      const userId = 'user-1';
      const assetId = 'asset-1';

      // First call: override exists
      selectChain.limit.mockResolvedValueOnce([{
        id: 'override-1',
        userId,
        assetId,
        priceCents: 5000n,
        currency: 'BRL',
        createdAt: new Date(),
      }]);

      let result = await resolveEffectiveQuote(userId, assetId, {
        priceCents: 3000n,
        currency: 'BRL',
        isStale: false,
      });
      expect(result!.source).toBe('override');
      expect(result!.priceCents).toBe(5000n);

      // Clear override
      deleteChain.where.mockResolvedValueOnce({ rowCount: 1 });
      await clearUserOverride(userId, assetId);

      // Second call: no override
      selectChain.limit.mockResolvedValueOnce([]);

      result = await resolveEffectiveQuote(userId, assetId, {
        priceCents: 3000n,
        currency: 'BRL',
        isStale: false,
      });
      expect(result!.source).toBe('cache');
      expect(result!.priceCents).toBe(3000n);
    });
  });

  describe('last-write-wins', () => {
    it('updates existing override (upsert behavior)', async () => {
      const userId = 'user-1';
      const assetId = 'asset-1';
      const newPrice = 6000n;

      // Mock asset exists
      selectChain.limit.mockResolvedValueOnce([{ id: assetId }]);

      // Mock upsert result
      insertChain.onConflictDoUpdate.mockReturnValue(insertChain);
      insertChain.returning.mockResolvedValueOnce([{
        id: 'override-1',
        userId,
        assetId,
        priceCents: newPrice,
        currency: 'BRL',
        createdAt: new Date(),
      }]);

      const result = await setUserOverride(userId, assetId, newPrice, 'BRL');

      expect(result.priceCents).toBe(newPrice);
      expect(insertChain.onConflictDoUpdate).toHaveBeenCalled();
    });

    it('creates new override when none exists', async () => {
      const userId = 'user-1';
      const assetId = 'asset-1';
      const price = 4000n;

      // Mock asset exists
      selectChain.limit.mockResolvedValueOnce([{ id: assetId }]);

      // Mock insert result
      insertChain.onConflictDoUpdate.mockReturnValue(insertChain);
      insertChain.returning.mockResolvedValueOnce([{
        id: 'override-1',
        userId,
        assetId,
        priceCents: price,
        currency: 'BRL',
        createdAt: new Date(),
      }]);

      const result = await setUserOverride(userId, assetId, price, 'BRL');

      expect(result.priceCents).toBe(price);
    });
  });
});
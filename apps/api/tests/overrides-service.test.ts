/**
 * Overrides service predicate isolation tests (ADR-006).
 *
 * Directly exercises market-data overrides service functions to assert that
 * database predicates are scoped to the authenticated user. The fake DB
 * captures predicate nodes (not evaluated results), so assertions are made
 * against generated WHERE clauses via whereFacts.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { quoteOverrides } from '../src/db/schema.js';
import { createFakeDb, type FakeDb } from './helpers/fake-db.js';
import { whereFacts } from './helpers/sql-facts.js';
import {
  getUserOverride,
  getUserOverrides,
  clearUserOverride,
} from '../src/services/market-data/overrides.js';

const { dbHolder } = vi.hoisted(() => ({
  dbHolder: { current: null as unknown },
}));

vi.mock('../src/db/client.js', () => ({
  getDb: () => dbHolder.current,
}));

const fakeDb: FakeDb = createFakeDb();
dbHolder.current = fakeDb;

function capturesFor(method: 'select' | 'update' | 'delete') {
  return fakeDb
    .getWhereCaptures()
    .filter((capture) => capture.table === quoteOverrides && capture.method === method);
}

beforeEach(() => {
  fakeDb.reset();
  vi.clearAllMocks();
});

describe('ADR-006: getUserOverride predicate scoping', () => {
  it('binds read to user_id and asset_id', async () => {
    fakeDb.queueResults(quoteOverrides, []);

    await getUserOverride('user-1', 'asset-petr4');

    const selects = capturesFor('select');
    expect(selects).toHaveLength(1);
    const facts = whereFacts(selects[0]?.where);
    expect(facts.columns).toEqual(expect.arrayContaining(['user_id', 'asset_id']));
    expect(facts.values).toContain('user-1');
    expect(facts.values).toContain('asset-petr4');
  });
});

describe('ADR-006: getUserOverrides predicate scoping', () => {
  it('binds list read to user_id only', async () => {
    fakeDb.queueResults(quoteOverrides, []);

    await getUserOverrides('user-1');

    const selects = capturesFor('select');
    expect(selects).toHaveLength(1);
    const facts = whereFacts(selects[0]?.where);
    expect(facts.columns).toContain('user_id');
    expect(facts.values).toContain('user-1');
  });
});

describe('ADR-006: clearUserOverride predicate scoping', () => {
  it('binds delete to user_id and asset_id', async () => {
    fakeDb.queueResults(quoteOverrides, []);

    await clearUserOverride('user-1', 'asset-petr4');

    const deletes = fakeDb.getDeleteCaptures().filter((c) => c.table === quoteOverrides);
    expect(deletes).toHaveLength(1);
    const facts = whereFacts(deletes[0]?.where);
    expect(facts.columns).toEqual(expect.arrayContaining(['user_id', 'asset_id']));
    expect(facts.values).toContain('user-1');
    expect(facts.values).toContain('asset-petr4');
  });
});

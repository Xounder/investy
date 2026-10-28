import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { assets, holdings, quoteOverrides, quotes, transactions } from '../src/db/schema.js';
import { getCachedQuotes, getQuotesWithHydration } from '../src/services/market-data/cache.js';
import { providerRegistry, type QuoteResult } from '../src/services/market-data/quote-provider.js';
import { createFakeDb } from './helpers/fake-db.js';
import { whereFacts } from './helpers/sql-facts.js';

const { dbHolder, findSession } = vi.hoisted(() => ({ dbHolder: { db: null as unknown }, findSession: vi.fn() }));
vi.mock('../src/db/client.js', () => ({ getDb: () => dbHolder.db }));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: findSession } }));

const db = createFakeDb();
dbHolder.db = db;
const assetId = '00000000-0000-4000-8000-000000000003';
const accountId = '00000000-0000-4000-8000-000000000001';
const asset = { id: assetId, symbol: 'PETR4', name: 'Petrobras', class: 'acao',
  sector: 'Energy', currency: 'BRL', providerKey: null, isin: null, createdAt: new Date() };
const holding = { id: 'holding-1', userId: 'alice', assetId, accountId, qty: 2n,
  costBasisCents: 1600n, avgPriceCents: 800n, realizedPnlCents: 0n, updatedAt: new Date() };
const fresh = () => new Date(Date.now() + 60_000);
const expired = () => new Date(Date.now() - 60_000);
const stored = (priceCents: bigint, previousCloseCents: bigint | null, validUntil = fresh()) => ({
  id: crypto.randomUUID(), assetId, priceCents, previousCloseCents, currency: 'BRL',
  fxRateToBRL: null, source: 'brapi', isStale: false, fetchedAt: new Date(), validUntil,
});

const primary = vi.fn<(symbol: string, assetClass: 'acao') => Promise<QuoteResult | null>>();
const fallback = vi.fn<(symbol: string, assetClass: 'acao') => Promise<QuoteResult | null>>();
providerRegistry.register('acao', { name: 'task07-primary', supports: () => true, fetchQuote: primary });
providerRegistry.register('acao', { name: 'task07-fallback', supports: () => true, fetchQuote: fallback });
const assetClassMap = new Map([['PETR4', 'acao' as const]]);

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
  findSession.mockResolvedValue({ expiresAt: fresh() });
  primary.mockResolvedValue(null);
  fallback.mockResolvedValue(null);
});

describe('TASK-07 real quote cache with provider and DB boundaries', () => {
  it('persists selected provider price and close together and reads them from the DB', async () => {
    db.setResults(assets, [asset]);
    primary.mockResolvedValue({ priceCents: 900n, previousCloseCents: 1000n, currency: 'BRL', source: 'brapi' });
    const hydrated = await getQuotesWithHydration(['PETR4'], assetClassMap);
    expect(hydrated.quotes[0]?.quote).toMatchObject({ priceCents: 900n, previousCloseCents: 1000n });
    const inserted = db.getInsertPayloads().find((entry) => entry.table === quotes)?.values;
    expect(inserted).toMatchObject({ assetId, priceCents: 900n, previousCloseCents: 1000n, source: 'brapi' });
    expect(fallback).not.toHaveBeenCalled();
    db.setResults(quotes, [{ quote: inserted as Record<string, unknown>, asset }]);
    expect((await getCachedQuotes([assetId]))[0]?.quote).toMatchObject({ priceCents: 900n, previousCloseCents: 1000n });
  });

  it('persists null, not an old close, when the selected fallback has no close', async () => {
    db.setResults(assets, [asset]);
    fallback.mockResolvedValue({ priceCents: 1200n, currency: 'BRL', source: 'fallback' });
    const hydrated = await getQuotesWithHydration(['PETR4'], assetClassMap);
    expect(primary).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(hydrated.quotes[0]?.quote).toMatchObject({ priceCents: 1200n, previousCloseCents: null, source: 'fallback' });
    const inserted = db.getInsertPayloads().find((entry) => entry.table === quotes)?.values;
    expect(inserted).toMatchObject({ previousCloseCents: null });
    db.setResults(quotes, [{ quote: inserted as Record<string, unknown>, asset }]);
    expect((await getCachedQuotes([assetId]))[0]?.quote).toMatchObject({ priceCents: 1200n, previousCloseCents: null });
  });

  it('retains matching old price and close on failed hydration, flagged stale', async () => {
    const old = stored(800n, 1000n, expired());
    db.setResults(assets, [asset]);
    db.setResults(quotes, [{ quote: old, asset }]);
    const hydrated = await getQuotesWithHydration(['PETR4'], assetClassMap);
    expect(hydrated.stale).toEqual(['PETR4']);
    expect(hydrated.quotes[0]).toMatchObject({ quote: { priceCents: 800n, previousCloseCents: 1000n }, isExpired: true });
    expect(db.getInsertPayloads().filter((entry) => entry.table === quotes)).toHaveLength(0);
  });
});

describe('TASK-07 real services through quote and holding detail routes', () => {
  it('returns signed cached market change; authenticates override and nulls market change on both routes', async () => {
    const quote = stored(900n, 1000n);
    db.setResults(assets, [asset]);
    db.setResults(quotes, [{ quote, asset }]);
    const anonymous = await app.request('/api/v1/market/quotes?symbols=PETR4');
    expect(anonymous.status).toBe(200);
    expect(await anonymous.json()).toMatchObject({ quotes: [{ priceCents: '900', dayChangePercent: -10, override: null }] });

    db.reset();
    db.setResults(assets, [asset]);
    db.setResults(quotes, [{ quote, asset }]);
    db.setResults(holdings, [{ holding, asset }]);
    db.setResults(transactions, []);
    const headers = { Cookie: `session=${createSessionToken('alice')}` };
    const before = await app.request(`/api/v1/holdings/${assetId}`, { headers });
    expect(before.status).toBe(200);
    expect(await before.json()).toMatchObject({ summary: { dayChangePercent: -10 }, quote: { dayChangePercent: -10, priceCents: '900' } });

    db.reset();
    db.setResults(assets, [asset]);
    db.setResults(quotes, [{ quote, asset }]);
    db.setResults(holdings, [{ holding, asset }]);
    db.setResults(transactions, []);
    db.setResults(quoteOverrides, [{ id: 'override', assetId, userId: 'alice', priceCents: 1200n, currency: 'BRL', createdAt: new Date() }]);
    const market = await app.request('/api/v1/market/quotes?symbols=PETR4', { headers });
    expect(market.status).toBe(200);
    expect(await market.json()).toMatchObject({ quotes: [{ dayChangePercent: null, override: { priceCents: '1200' } }] });
    const detail = await app.request(`/api/v1/holdings/${assetId}`, { headers });
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ summary: { dayChangePercent: null }, quote: { dayChangePercent: null, priceCents: '1200', isOverride: true } });
    const ownershipChecks = db.getWhereCaptures().filter((entry) => entry.table === quoteOverrides);
    expect(ownershipChecks).toHaveLength(2);
    for (const check of ownershipChecks) expect(whereFacts(check.where).values).toContain('alice');
  });
});

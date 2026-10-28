import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { refreshAccounts, refreshPrices } from './cache';

describe('settings cache synchronization', () => {
  it('refetches active account consumers and marks inactive drawer/journal entries stale', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 600_000 } } });
    // Seed cached results without mounting React: inactive queries are marked stale for the next screen.
    client.setQueryData(['accounts', 'p1'], ['old-account']);
    client.setQueryData(['journal-accounts', ['p1']], ['old-account']);
    client.setQueryData(['settings', 'accounts', 'p1'], ['old-account']);
    await refreshAccounts(client);
    expect(client.getQueryState(['accounts', 'p1'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['journal-accounts', ['p1']])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['settings', 'accounts', 'p1'])?.isInvalidated).toBe(true);
  });

  it('marks quote, position, holdings and dashboard consumers stale after clearing a price', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 600_000 } } });
    const keys = [['settings', 'overrides'], ['asset', 'PETR4'], ['position', 'a1'], ['holdings', null], ['dashboard-summary', 'p1'], ['dashboard-allocation', 'p1'], ['quote', 'PETR4']];
    for (const key of keys) client.setQueryData(key, { oldPrice: '100' });
    client.setQueryData(['portfolios'], ['unchanged']);
    await refreshPrices(client);
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(['portfolios'])?.isInvalidated).toBe(false);
  });

  it('refetches a mounted asset quote and dashboard after an override is removed', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 600_000, retry: false } } });
    let effective = 'manual';
    const quote = new QueryObserver(client, { queryKey: ['asset', 'PETR4'], queryFn: async () => effective });
    const summary = new QueryObserver(client, { queryKey: ['dashboard-summary', 'p1'], queryFn: async () => effective });
    const stopQuote = quote.subscribe(() => {});
    const stopSummary = summary.subscribe(() => {});
    await vi.waitFor(() => expect(quote.getCurrentResult().data).toBe('manual'));
    await vi.waitFor(() => expect(summary.getCurrentResult().data).toBe('manual'));
    effective = 'provider';
    await refreshPrices(client);
    expect(quote.getCurrentResult().data).toBe('provider');
    expect(summary.getCurrentResult().data).toBe('provider');
    stopQuote();
    stopSummary();
  });
});

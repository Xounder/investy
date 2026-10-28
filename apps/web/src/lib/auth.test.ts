import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { adoptSession, clearOwnerState } from './auth';
import { useUiStore } from '@/stores/ui';

describe('authenticated owner transition', () => {
  it('cancels old owner requests, removes cached holdings and transient state before adopting a verified profile', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useUiStore.getState().setActivePortfolioId('old-portfolio');
    useUiStore.getState().setRegisterFeedback('old owner');
    client.setQueryData(['holdings', 'old-portfolio'], ['private holding']);
    client.setQueryData(['settings', 'profile'], { id: 'old', email: 'old@example.com' });
    await adoptSession(client, { id: 'new', name: 'Nova', email: 'new@example.com' });
    expect(client.getQueryData(['holdings', 'old-portfolio'])).toBeUndefined();
    expect(client.getQueryData(['settings', 'profile'])).toMatchObject({ id: 'new' });
    expect(useUiStore.getState().activePortfolioId).toBeNull();
    expect(useUiStore.getState().registerFeedback).toBeNull();
    await clearOwnerState(client);
    expect(client.getQueryData(['settings', 'profile'])).toBeUndefined();
  });
});

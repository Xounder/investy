import type { QueryClient } from '@tanstack/react-query';

/** Refresh both settings tables and consumers mounted in other routes. */
export async function refreshAccounts(client: QueryClient) {
  await Promise.all(['settings', 'accounts', 'journal-accounts', 'prefill-account-portfolio'].map((key) =>
    client.invalidateQueries({ queryKey: key === 'settings' ? ['settings', 'accounts'] : [key] })));
}

export async function refreshPrices(client: QueryClient) {
  await Promise.all(['settings', 'asset', 'assets', 'asset-catalog', 'position', 'holdings', 'quote'].map((key) =>
    client.invalidateQueries({ queryKey: key === 'settings' ? ['settings', 'overrides'] : [key] })));
  await client.invalidateQueries({ predicate: ({ queryKey }) => typeof queryKey[0] === 'string' && queryKey[0].startsWith('dashboard-') });
  await client.invalidateQueries({ predicate: ({ queryKey }) => typeof queryKey[0] === 'string' && (queryKey[0].startsWith('reports-') || queryKey[0] === 'summary' || queryKey[0] === 'market') });
}

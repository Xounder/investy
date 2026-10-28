import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import TransactionsImportPage from './TransactionsImportPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('keeps the submitted CSV associated with its response, then allows a different file', async () => {
  let resolveUpload: ((response: Response) => void) | undefined;
  const submitted: File[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/portfolios')) return Response.json({ portfolios: [{ id: 'p1', name: 'Principal' }] });
    if (url.includes('/accounts')) return Response.json({ accounts: [{ id: 'a1', portfolioId: 'p1', name: 'Minha conta' }] });
    if (url.endsWith('/import/csv')) {
      submitted.push((init!.body as FormData).get('file') as File);
      return new Promise<Response>((resolve) => { resolveUpload = resolve; });
    }
    throw new Error(`Unexpected ${url}`);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><TransactionsImportPage /></QueryClientProvider></MemoryRouter>);
  const input = screen.getByLabelText('Arquivo CSV');
  await screen.findByRole('button', { name: /Baixar modelo CSV/ });
  fireEvent.change(input, { target: { files: [new File(['A'], 'A.csv')] } });
  fireEvent.click(screen.getByRole('button', { name: 'Importar CSV' }));
  await waitFor(() => expect(submitted.map((f) => f.name)).toEqual(['A.csv']));
  expect(input).toHaveProperty('disabled', true);
  expect(screen.getByText('Selecionado: A.csv')).toBeTruthy();
  resolveUpload!(Response.json({ created: 0, errors: [{ line: 2, message: 'Account not found' }] }, { status: 400 }));
  expect(await screen.findByText(/Linha 2: Conta não encontrada/)).toBeTruthy();
  expect(screen.getByText('Account not found')).toBeTruthy();
  expect(input).toHaveProperty('disabled', false);
  fireEvent.change(input, { target: { files: [new File(['B'], 'B.csv')] } });
  expect(screen.getByText('Selecionado: B.csv')).toBeTruthy();
  expect(screen.queryByText(/Linha 2: Conta não encontrada/)).toBeNull();
  expect(submitted).toHaveLength(1);
});

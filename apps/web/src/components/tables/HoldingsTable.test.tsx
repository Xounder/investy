import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { Holding } from '@/lib/journal';
import { HoldingsTable } from './HoldingsTable';

afterEach(cleanup);

const base: Holding = {
  id: '1', accountId: 'account', assetId: 'asset', symbol: 'PLUS', assetName: 'Ativo',
  assetClass: 'acao', assetCurrency: 'BRL', qty: '10', avgPriceCents: '1000',
  costBasisCents: '10000', priceCents: '1200', marketValueCentsBRL: '12000',
  unrealizedPnlCentsBRL: '2000', dayChangePercent: 2.5, isStale: false,
};

describe('HoldingsTable daily quote change', () => {
  it('shows signed native-currency percent and tone for positive, negative, zero and unavailable', () => {
    const rows: Holding[] = [
      base,
      { ...base, id: '2', symbol: 'MINUS', assetCurrency: 'USD', dayChangePercent: -2.5 },
      { ...base, id: '3', symbol: 'ZERO', dayChangePercent: 0 },
      { ...base, id: '4', symbol: 'MISSING', dayChangePercent: null },
    ];
    render(<MemoryRouter><HoldingsTable rows={rows} /></MemoryRouter>);
    const checks = [
      { symbol: 'PLUS', label: 'Variação diária da cotação em BRL, sem câmbio: +2,50%', text: '+2,50%', tone: 'text-green-700' },
      { symbol: 'MINUS', label: 'Variação diária da cotação em USD, sem câmbio: −2,50%', text: '−2,50%', tone: 'text-red-700' },
      { symbol: 'ZERO', label: 'Variação diária da cotação em BRL, sem câmbio: 0,00%', text: '0,00%', tone: 'text-gray-700' },
      { symbol: 'MISSING', label: 'Variação diária da cotação em BRL, sem câmbio: indisponível', text: '—', tone: '' },
    ];
    for (const check of checks) {
      const row = screen.getByRole('row', { name: new RegExp(check.symbol) });
      const cell = within(row).getByRole('cell', { name: check.label });
      expect(cell.textContent).toBe(check.text);
      if (check.tone) expect(cell.className).toContain(check.tone);
      else {
        expect(cell.className).not.toContain('text-green-700');
        expect(cell.className).not.toContain('text-red-700');
      }
    }
    expect(screen.getByRole('columnheader', { name: 'Dia Δ' }).getAttribute('title')).toContain('não inclui câmbio');
  });
});

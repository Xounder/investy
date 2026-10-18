/**
 * Shared row fixtures for market/asset route integration tests.
 *
 * Centralises the catalog asset rows and the quote/benchmark row builders so
 * individual test files stay under the project file size limit and describe the
 * same rows consistently.
 */
import type { FakeRow } from './fake-db.js';

export const PETR4_ASSET: FakeRow = {
  id: 'asset-petr4',
  symbol: 'PETR4',
  name: 'Petroleo Brasileiro SA - Petrobras PN',
  class: 'acao',
  sector: 'Petroleo e Gas',
  currency: 'BRL',
  providerKey: 'PETR4',
  isin: 'BRPETRACNPR6',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

export const VALE3_ASSET: FakeRow = {
  id: 'asset-vale3',
  symbol: 'VALE3',
  name: 'Vale SA ON',
  class: 'acao',
  sector: 'Mineracao',
  currency: 'BRL',
  providerKey: 'VALE3',
  isin: 'BRVALEACNOR0',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

export function quoteRow(options: {
  assetId: string;
  priceCents: bigint;
  isStale?: boolean;
  validUntil?: Date;
}): FakeRow {
  return {
    id: `quote-${options.assetId}`,
    assetId: options.assetId,
    priceCents: options.priceCents,
    currency: 'BRL',
    fxRateToBRL: null,
    source: 'brapi',
    isStale: options.isStale ?? false,
    fetchedAt: new Date('2024-06-01T12:00:00.000Z'),
    validUntil: options.validUntil ?? new Date(Date.now() + 60 * 60 * 1000),
  };
}

export function benchmarkRow(symbol: string, isoDate: string, value: bigint): FakeRow {
  return {
    id: `${symbol}-${isoDate}`,
    symbol,
    date: new Date(isoDate),
    value,
    createdAt: new Date(isoDate),
  };
}

/**
 * Drizzle enums for Investy (apps/api).
 *
 * Split out of the monolithic schema module (TASK-04 VERIFY 4) so every schema
 * file stays under the 400-line project limit.
 */
import { pgEnum } from 'drizzle-orm/pg-core';

// AssetClass values (duplicated from @investy/domain for schema independence)
const ASSET_CLASSES = [
  'acao',
  'fii',
  'etf',
  'etf_us',
  'etf_ie',
  'bdr',
  'crypto',
  'rf',
  'tesouro',
  'indice',
] as const;

export const transactionTypeEnum = pgEnum('transaction_type', [
  'buy',
  'sell',
  'split',
  'bonificacao',
  'dividend',
  'jcp',
  'amortizacao',
  'adjustment',
  'opening',
]);

export const dividendKindEnum = pgEnum('dividend_kind', [
  'dividend',
  'jcp',
  'rendimento',
  'amortizacao',
]);

export const assetClassEnum = pgEnum('asset_class', ASSET_CLASSES);

export const dividendStatusEnum = pgEnum('dividend_status', [
  'expected',
  'confirmed',
  'paid',
]);

export const dividendSourceEnum = pgEnum('dividend_source', [
  'provider',
  'manual',
]);

export const notaStatusEnum = pgEnum('nota_status', ['pending', 'confirmed']);

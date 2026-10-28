import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { assets, notaimports } from '../../db/schema.js';
import type { NotaData } from './nota-parser.js';

export interface ImportWarning { type: 'UNKNOWN_ASSET' | 'DATE_MISMATCH' | 'DUPLICATE'; message: string; details?: string }

export async function reconcileNota(userId: string, brokerId: string, nota: NotaData): Promise<{
  warnings: ImportWarning[]; catalog: Map<string, typeof assets.$inferSelect>;
}> {
  const symbols = [...new Set(nota.items.map((i) => i.symbol))];
  const catalogRows = await getDb().select().from(assets).where(inArray(assets.symbol, symbols));
  const catalog = new Map(catalogRows.map((a) => [a.symbol, a]));
  const warnings: ImportWarning[] = [];
  for (const symbol of symbols) if (!catalog.has(symbol)) {
    warnings.push({ type: 'UNKNOWN_ASSET', message: 'Ativo não encontrado no catálogo', details: symbol });
  }
  for (const [index, item] of nota.items.entries()) if (item.tradeDate && item.tradeDate !== nota.tradeDate) {
    warnings.push({ type: 'DATE_MISMATCH', message: 'Data do negócio difere da nota', details: String(index + 1) });
  }
  const duplicate = await getDb().select({ id: notaimports.id }).from(notaimports).where(and(
    eq(notaimports.userId, userId), eq(notaimports.brokerId, brokerId),
    eq(notaimports.notaNumber, nota.notaNumber), eq(notaimports.tradeDate, new Date(`${nota.tradeDate}T00:00:00Z`)),
  )).limit(1);
  if (duplicate.length) warnings.push({ type: 'DUPLICATE', message: 'Nota já importada', details: duplicate[0]!.id });
  return { warnings, catalog };
}

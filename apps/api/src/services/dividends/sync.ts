import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { assets, portfolios, transactions } from '../../db/schema.js';
import { checkProviderQuota } from '../market-data/provider-rate-limit.js';
import { createDividend, DividendError, type DividendKind } from '../dividends.js';

const validDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

/** Callable by a worker: no client-supplied URL or token, and failed fetches do not mutate data. */
export async function syncFiiDividends(userId: string, portfolioId: string): Promise<{ created: number; skipped: number; failed: number }> {
  const db = getDb();
  const [portfolio] = await db.select().from(portfolios).where(and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId)));
  if (!portfolio) throw new DividendError('NOT_FOUND', 'Portfolio not found');
  const [catalog, journal] = await Promise.all([
    db.select().from(assets).where(eq(assets.class, 'fii')),
    db.select({ assetId: transactions.assetId }).from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.portfolioId, portfolioId))),
  ]);
  const ownedAssetIds = new Set(journal.map((entry) => entry.assetId));
  const result = { created: 0, skipped: 0, failed: 0 };
  for (const asset of catalog) {
    if (!ownedAssetIds.has(asset.id)) continue;
    if (!/^[A-Z0-9]{4,12}$/.test(asset.symbol)) { result.skipped++; continue; }
    if (!checkProviderQuota('brapi')) { result.skipped++; continue; }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let response: Response;
      try {
        response = await fetch(`https://brapi.dev/api/v2/fii/dividends?symbols=${encodeURIComponent(asset.symbol)}`, {
          headers: { Accept: 'application/json', ...(process.env.BRAPI_API_KEY ? { Authorization: `Bearer ${process.env.BRAPI_API_KEY}` } : {}) },
          signal: controller.signal,
        });
      } finally { clearTimeout(timeout); }
      if (!response.ok) { result.failed++; continue; }
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !('dividends' in payload) || !Array.isArray(payload.dividends)) {
        result.failed++; continue;
      }
      for (const entry of payload.dividends) {
        if (!entry || typeof entry !== 'object') { result.skipped++; continue; }
        const item = entry as Record<string, unknown>;
        if (item.symbol !== asset.symbol || !['RENDIMENTO', 'AMORTIZAÇÃO'].includes(String(item.label))) {
          result.skipped++; continue;
        }
        const kind: DividendKind = item.label === 'AMORTIZAÇÃO' ? 'amortizacao' : 'rendimento';
        const exDate = item.exDate ?? (validDate(item.lastDatePrior)
          ? new Date(Date.parse(item.lastDatePrior) + 86_400_000).toISOString().slice(0, 10) : null);
        const paymentDate = item.paymentDate;
        const rate = item.rate;
        // Integer cents cannot represent sub-cent rates. Skip and signal rather than silently round cash.
        if (!validDate(exDate) || !validDate(paymentDate) || paymentDate <= exDate ||
          typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 ||
          !Number.isSafeInteger(Math.round(rate * 100)) || Math.round(rate * 100) <= 0 ||
          Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-9) {
          console.warn(`[Dividends] Skipped unsupported rate or date for ${asset.symbol}`);
          result.skipped++; continue;
        }
        try {
          await createDividend(userId, { portfolioId, assetId: asset.id, kind, exDate: new Date(exDate),
            paymentDate: new Date(paymentDate), rateCentsPerUnit: BigInt(Math.round(rate * 100)) }, 'provider');
          result.created++;
        } catch (error) {
          if (error instanceof DividendError && error.code === 'CONFLICT') result.skipped++;
          else throw error;
        }
      }
    } catch { result.failed++; }
  }
  return result;
}

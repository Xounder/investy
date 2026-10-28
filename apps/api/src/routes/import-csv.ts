import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { accounts, assets } from '../db/schema.js';
import { authMiddleware, requireUser } from '../middleware/auth.js';
import { appendJournalBatch, JournalServiceError, mapJournalError } from '../services/journal.js';
import { decodeCsv, parseCsv } from '../services/import/csv-parser.js';
import { boundedMultipart, UploadError } from '../services/import/multipart.js';

const app = new Hono();
app.use('*', authMiddleware);

app.post('/', async (c) => {
  const userId = requireUser(c);
  let form: FormData;
  try { form = await boundedMultipart(c, 1_100_000); }
  catch (error) {
    if (error instanceof UploadError) return c.json({ error: { code: 'VALIDATION', message: error.message } }, error.status);
    throw error;
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size > 1_000_000 || file.size === 0 || !/\.csv$/i.test(file.name)) {
    return c.json({ error: { code: 'VALIDATION', message: 'CSV file required (max 1 MB)' } }, 400);
  }
  let parsed;
  try { parsed = parseCsv(decodeCsv(new Uint8Array(await file.arrayBuffer()))); }
  catch (error) { return c.json({ created: 0, errors: [{ line: 1, message: (error as Error).message }] }, 400); }
  if (parsed.rows.length > 200) parsed.errors.push({ line: 1, message: 'Maximum 200 rows' });
  const db = getDb();
  const accountNames = [...new Set(parsed.rows.map((r) => r.account))];
  const symbols = [...new Set(parsed.rows.map((r) => r.symbol))];
  const owned = accountNames.length ? await db.select().from(accounts).where(and(
    eq(accounts.userId, userId), inArray(accounts.name, accountNames),
  )) : [];
  const catalog = symbols.length ? await db.select().from(assets).where(inArray(assets.symbol, symbols)) : [];
  const byAccount = new Map(owned.map((a) => [a.name, a]));
  const bySymbol = new Map(catalog.map((a) => [a.symbol, a]));
  for (const row of parsed.rows) {
    if (!byAccount.has(row.account)) parsed.errors.push({ line: row.line, message: 'Account not found' });
    const asset = bySymbol.get(row.symbol);
    if (!asset) parsed.errors.push({ line: row.line, message: 'Asset not found' });
    else if ((asset.currency === 'USD') !== (row.fxRateToBRL != null)) {
      parsed.errors.push({ line: row.line, message: 'USD requires original historical FX; BRL must not include FX' });
    }
  }
  if (parsed.errors.length) return c.json({ created: 0, errors: parsed.errors }, 400);
  try {
    const result = await appendJournalBatch(userId, parsed.rows.map((r) => ({
      portfolioId: byAccount.get(r.account)!.portfolioId, accountId: byAccount.get(r.account)!.id,
      assetId: bySymbol.get(r.symbol)!.id, type: r.type, date: r.date, qty: r.qty,
      unitPriceCents: r.unitPriceCents, feeCents: r.feeCents, fxRateToBRL: r.fxRateToBRL,
    })), 'csv');
    return c.json({ created: result.created, errors: [] }, 201);
  } catch (error) {
    const mapped = mapJournalError(error);
    if (mapped instanceof JournalServiceError) return c.json({ created: 0, errors: [{ line: 0, message: mapped.message }] }, 400);
    throw error;
  }
});

export default app;

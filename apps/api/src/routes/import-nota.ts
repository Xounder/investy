import { createHash, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { accounts, brokers, notaimports } from '../db/schema.js';
import { authMiddleware, requireUser } from '../middleware/auth.js';
import { serialize } from '../lib/serialize.js';
import { validateBody } from '../lib/validation.js';
import { appendJournalBatch, JournalServiceError, mapJournalError } from '../services/journal.js';
import { decodeCsv } from '../services/import/csv-parser.js';
import { parseNota, type NotaData } from '../services/import/nota-parser.js';
import { allocateNotaFees } from '../services/import/rateio.js';
import { reconcileNota } from '../services/import/reconciliation.js';
import { boundedMultipart, UploadError } from '../services/import/multipart.js';

const app = new Hono();
app.use('*', authMiddleware);
const previews = new Map<string, { userId: string; brokerId: string; accountId: string; nota: NotaData; expires: number }>();
const ttl = 15 * 60 * 1000;
const error = (message: string, status: 400 | 409 | 413) => Response.json({ error: {
  code: status === 409 ? 'RECONCILIATION' : 'VALIDATION', message,
} }, { status });

app.post('/preview', async (c) => {
  const userId = requireUser(c);
  let form: FormData;
  try { form = await boundedMultipart(c, 5_300_000); }
  catch (e) { if (e instanceof UploadError) return error(e.message, e.status); throw e; }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > 5_000_000) return error('Arquivo obrigatório (máximo 5 MB)', 413);
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['pdf', 'txt', 'csv', 'xml'].includes(extension ?? '')) return error('Formato não suportado', 400);
  let nota: NotaData;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text: string;
    if (extension === 'pdf') {
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return error('PDF inválido', 400);
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: bytes });
      try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
      if (!text.trim()) return error('Não foi possível extrair texto do PDF', 400);
    } else text = decodeCsv(bytes);
    nota = parseNota(text, extension === 'csv' ? 'csv' : extension === 'xml' ? 'xml' : 'text');
  } catch (e) { return error((e as Error).message, 400); }
  const brokerId = form.get('brokerId');
  const db = getDb();
  const matches = typeof brokerId === 'string' && brokerId ?
    await db.select().from(brokers).where(eq(brokers.id, brokerId)) :
    await db.select().from(brokers).where(eq(brokers.name, nota.broker));
  if (matches.length !== 1) return error('Corretora não encontrada; informe brokerId', 400);
  const broker = matches[0]!;
  const owned = await db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.brokerId, broker.id)));
  const accountId = form.get('accountId');
  const account = typeof accountId === 'string' && accountId ? owned.find((a) => a.id === accountId) :
    owned.length === 1 ? owned[0] : undefined;
  if (!account) return error('Informe accountId de uma conta sua nesta corretora', 400);
  const { warnings, catalog } = await reconcileNota(userId, broker.id, nota);
  for (const item of nota.items) if (catalog.get(item.symbol)?.currency !== 'BRL' && catalog.has(item.symbol)) {
    warnings.push({ type: 'UNKNOWN_ASSET', message: 'Ativo não pode ser importado sem câmbio histórico', details: item.symbol });
  }
  let rateio: bigint[];
  try {
    const total = Object.values(nota.fees).reduce((a, b) => a + b, 0n);
    if (total > 0n && nota.items.every((i) => i.type)) return error('Taxas sem negócios para rateio', 400);
    rateio = allocateNotaFees(total, nota.items.map((i) => i.type ? 0n : i.qty * i.unitPriceCents));
  } catch (e) { return error((e as Error).message, 400); }
  for (const [token, entry] of previews) if (entry.expires < Date.now()) previews.delete(token);
  const importToken = randomUUID();
  previews.set(importToken, { userId, brokerId: broker.id, accountId: account.id, nota, expires: Date.now() + ttl });
  return c.json({ nota: serialize({ brokerId: broker.id, notaNumber: nota.notaNumber, tradeDate: nota.tradeDate,
    items: nota.items, fees: nota.fees, rateio, warnings, importToken }) });
});

app.post('/confirm', async (c) => {
  const userId = requireUser(c);
  const { importToken } = await validateBody(c, z.object({ importToken: z.string().uuid() }));
  const preview = previews.get(importToken);
  if (!preview || preview.expires < Date.now()) {
    previews.delete(importToken);
    return error('Token expirado; envie a nota novamente', 400);
  }
  if (preview.userId !== userId) return error('Token inválido', 400);
  // Claim before the first await: concurrent requests cannot consume the same token.
  previews.delete(importToken);
  const { nota, brokerId, accountId } = preview;
  const { warnings, catalog } = await reconcileNota(userId, brokerId, nota);
  if (warnings.length || nota.items.some((i) => catalog.get(i.symbol)?.currency !== 'BRL')) {
    return error('Conciliação pendente: ' + warnings.map((w) => w.message).join(', '), 409);
  }
  const [account] = await getDb().select().from(accounts).where(and(eq(accounts.userId, userId),
    eq(accounts.id, accountId), eq(accounts.brokerId, brokerId))).limit(1);
  if (!account) return error('Conta não encontrada', 409);
  const fees = allocateNotaFees(Object.values(nota.fees).reduce((a, b) => a + b, 0n),
    nota.items.map((i) => i.type ? 0n : i.qty * i.unitPriceCents));
  const id = randomUUID();
  try {
    const result = await appendJournalBatch(userId, nota.items.map((item, index) => ({
      portfolioId: account.portfolioId, accountId, assetId: catalog.get(item.symbol)!.id,
      type: item.type ?? (item.direction === 'C' ? 'buy' as const : 'sell' as const),
      date: new Date(`${nota.tradeDate}T00:00:00Z`), qty: item.qty,
      unitPriceCents: item.unitPriceCents, feeCents: fees[index]!,
      factor: item.factor,
      notes: item.dayTrade ? 'Day trade' : null,
    })), 'nota', id, async (tx) => {
      const duplicate = await tx.select({ id: notaimports.id }).from(notaimports).where(and(
        eq(notaimports.userId, userId), eq(notaimports.brokerId, brokerId),
        eq(notaimports.notaNumber, nota.notaNumber), eq(notaimports.tradeDate, new Date(`${nota.tradeDate}T00:00:00Z`)),
      )).limit(1);
      if (duplicate.length) throw new JournalServiceError('VALIDATION', 'Nota já importada');
      await tx.insert(notaimports).values({ id, userId, brokerId, notaNumber: nota.notaNumber,
        tradeDate: new Date(`${nota.tradeDate}T00:00:00Z`), payload: serialize({ nota, fees }), status: 'confirmed',
        importHash: createHash('sha256').update(JSON.stringify(serialize(nota))).digest('hex') });
    });
    return c.json(serialize(result), 201);
  } catch (e) {
    const mapped = mapJournalError(e);
    if (mapped instanceof JournalServiceError) return error(mapped.message, mapped.message.includes('já importada') ? 409 : 400);
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === '23505') return error('Nota já importada', 409);
    throw e;
  }
});

app.get('/history', async (c) => {
  const userId = requireUser(c);
  const rows = await getDb().select({ id: notaimports.id, brokerId: notaimports.brokerId,
    notaNumber: notaimports.notaNumber, tradeDate: notaimports.tradeDate,
    status: notaimports.status, createdAt: notaimports.createdAt }).from(notaimports)
    .where(eq(notaimports.userId, userId)).orderBy(desc(notaimports.createdAt)).limit(100);
  return c.json({ items: serialize(rows) });
});

export default app;

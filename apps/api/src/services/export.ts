import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import {
  accounts, assets, brokers, dividends, holdings, notaimports, portfolios,
  portfolioSnapshots, quoteOverrides, transactions, users, erasureTombstones,
} from '../db/schema.js';

export const EXPORT_SCHEMA_VERSION = 1;
const PAGE_SIZE = 200;
const encoder = new TextEncoder();
type Row = Record<string, unknown> & { id: string };
type Page = (userId: string, cursor: string) => Promise<Row[]>;

type Database = Pick<ReturnType<typeof getDb>, 'select'>;
function owned(table: typeof portfolios | typeof accounts | typeof transactions | typeof dividends |
  typeof holdings | typeof quoteOverrides | typeof portfolioSnapshots | typeof notaimports): Page {
  return async (userId, cursor) => getDb().select().from(table as typeof portfolios)
    .where(and(eq(table.userId, userId), gt(table.id, cursor)))
    .orderBy(table.id).limit(PAGE_SIZE);
}

// Catalog rows have no owner. Export ONLY references reachable from this user's rows.
const assetIds = (userId: string) => sql<string>`(
  select asset_id from transactions where user_id = ${userId}
  union select asset_id from dividends where user_id = ${userId}
  union select asset_id from holdings where user_id = ${userId}
  union select asset_id from quote_overrides where user_id = ${userId}
)`;
const brokerIds = (userId: string) => sql<string>`(
  select broker_id from accounts where user_id = ${userId}
  union select broker_id from nota_imports where user_id = ${userId}
)`;

export const exportPages: Record<string, Page> = {
  portfolios: owned(portfolios),
  brokers: (userId, cursor) => getDb().select().from(brokers)
    .where(and(gt(brokers.id, cursor), inArray(brokers.id, brokerIds(userId))))
    .orderBy(brokers.id).limit(PAGE_SIZE),
  accounts: owned(accounts),
  assets: (userId, cursor) => getDb().select().from(assets)
    .where(and(gt(assets.id, cursor), inArray(assets.id, assetIds(userId))))
    .orderBy(assets.id).limit(PAGE_SIZE),
  transactions: owned(transactions),
  dividends: owned(dividends),
  holdings: owned(holdings),
  overrides: owned(quoteOverrides),
  snapshots: owned(portfolioSnapshots),
  notaImports: owned(notaimports),
};

/** Bound pages to a single transaction; a snapshot must not mix different revisions. */
export function transactionPages(db: Database): Record<string, Page> {
  const scoped = (table: typeof portfolios | typeof accounts | typeof transactions | typeof dividends |
    typeof holdings | typeof quoteOverrides | typeof portfolioSnapshots | typeof notaimports): Page =>
    (userId, cursor) => db.select().from(table as typeof portfolios)
      .where(and(eq(table.userId, userId), gt(table.id, cursor)))
      .orderBy(table.id).limit(PAGE_SIZE);
  return {
    portfolios: scoped(portfolios),
    brokers: (userId, cursor) => db.select().from(brokers)
      .where(and(gt(brokers.id, cursor), inArray(brokers.id, brokerIds(userId))))
      .orderBy(brokers.id).limit(PAGE_SIZE),
    accounts: scoped(accounts),
    assets: (userId, cursor) => db.select().from(assets)
      .where(and(gt(assets.id, cursor), inArray(assets.id, assetIds(userId))))
      .orderBy(assets.id).limit(PAGE_SIZE),
    transactions: scoped(transactions), dividends: scoped(dividends), holdings: scoped(holdings),
    overrides: scoped(quoteOverrides), snapshots: scoped(portfolioSnapshots), notaImports: scoped(notaimports),
  };
}

export function losslessJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => typeof v === 'bigint' ? v.toString() : v);
}

async function* rows(page: Page, userId: string): AsyncGenerator<Row> {
  let cursor = '';
  while (true) {
    const batch = await page(userId, cursor);
    if (!batch.length) break;
    for (const row of batch) yield row;
    cursor = batch[batch.length - 1]!.id;
    if (batch.length < PAGE_SIZE) break;
  }
}

export async function* jsonExport(userId: string, pages = exportPages): AsyncGenerator<Uint8Array> {
  yield encoder.encode(`{"schemaVersion":${EXPORT_SCHEMA_VERSION},"ownerId":${JSON.stringify(userId)}`);
  for (const [key, page] of Object.entries(pages)) {
    yield encoder.encode(`,"${key}":[`);
    let first = true;
    for await (const row of rows(page, userId)) {
      yield encoder.encode(`${first ? '' : ','}${losslessJson(row)}`);
      first = false;
    }
    yield encoder.encode(']');
  }
  yield encoder.encode('}');
}

export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' :
    value instanceof Date ? value.toISOString() : typeof value === 'object' ? losslessJson(value) : String(value);
  // Quote all cells; prefix formula-looking text to prevent spreadsheet execution.
  const safe = /^[=+@\-\t\r]/.test(text) && !/^-?\d+$/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

const modules = [
  { name: 'holdings.csv', key: 'holdings', fields: ['id', 'accountId', 'assetId', 'qty', 'avgPriceCents', 'costBasisCents', 'realizedPnlCents'], labels: ['ID', 'Conta', 'Ativo', 'Quantidade', 'Preço médio (centavos)', 'Custo (centavos)', 'Resultado (centavos)'] },
  { name: 'transactions.csv', key: 'transactions', fields: ['id', 'portfolioId', 'accountId', 'assetId', 'type', 'date', 'qty', 'unitPriceCents', 'feeCents', 'currency', 'fxRateToBRL', 'notes'], labels: ['ID', 'Carteira', 'Conta', 'Ativo', 'Tipo', 'Data', 'Quantidade', 'Preço unitário (centavos)', 'Taxas (centavos)', 'Moeda', 'Câmbio para BRL', 'Observações'] },
  { name: 'dividends.csv', key: 'dividends', fields: ['id', 'portfolioId', 'assetId', 'kind', 'exDate', 'paymentDate', 'rateCentsPerUnit', 'status'], labels: ['ID', 'Carteira', 'Ativo', 'Tipo', 'Data ex', 'Data de pagamento', 'Valor por unidade (centavos)', 'Status'] },
  { name: 'performance.csv', key: 'snapshots', fields: ['id', 'portfolioId', 'date', 'totalValueCents', 'costBasisCents', 'allocationJsonb'], labels: ['ID', 'Carteira', 'Data', 'Valor total (centavos)', 'Custo (centavos)', 'Alocação'] },
] as const;

// ZIP32 stored entries with data descriptors: only four central directory records
// are held in memory, while each CSV row is emitted as soon as it is fetched.
const u16 = (v: number) => [v & 255, (v >>> 8) & 255];
const u32 = (v: number) => [...u16(v), ...u16(v >>> 16)];
const bytes = (...values: number[]) => Uint8Array.from(values);
function zipBounds(value: number): void {
  if (value > 0xffffffff) throw new Error('CSV archive exceeds ZIP32 limit');
}
function crc32(crc: number, data: Uint8Array): number {
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return crc;
}

export async function* csvArchive(userId: string, pages = exportPages): AsyncGenerator<Uint8Array> {
  let offset = 0;
  const central: Uint8Array[] = [];
  for (const module of modules) {
    const name = encoder.encode(module.name);
    const start = offset;
    zipBounds(start);
    const header = bytes(...u32(0x04034b50), ...u16(20), ...u16(0x808), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...u32(0), ...u16(name.length), ...u16(0), ...name);
    yield header;
    offset += header.length;
    zipBounds(offset);
    let size = 0;
    let crc = 0xffffffff;
    async function* lines(): AsyncGenerator<string> {
      yield `${module.labels.map(csvCell).join(';')}\r\n`;
      for await (const row of rows(pages[module.key]!, userId)) {
        yield `${module.fields.map((field) => csvCell(row[field])).join(';')}\r\n`;
      }
    }
    for await (const line of lines()) {
      const chunk = encoder.encode(line);
      size += chunk.length;
      zipBounds(size);
      zipBounds(offset + chunk.length + 16);
      crc = crc32(crc, chunk);
      yield chunk;
      offset += chunk.length;
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const descriptor = bytes(...u32(0x08074b50), ...u32(crc), ...u32(size), ...u32(size));
    yield descriptor;
    offset += descriptor.length;
    zipBounds(offset);
    central.push(bytes(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x808), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(start), ...name));
  }
  const centralStart = offset;
  for (const record of central) {
    yield record;
    offset += record.length;
    zipBounds(offset + 22);
  }
  yield bytes(...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length), ...u32(offset - centralStart), ...u32(centralStart), ...u16(0));
}

/** The transaction begins on first pull and stays open until completion/cancel.
 * One outstanding chunk at a time; cancellation rejects the waiter and rolls
 * back the read-only transaction, releasing its PostgreSQL connection. */
export function exportStream(userId: string, format: 'json' | 'csv' = 'json'): ReadableStream<Uint8Array> {
  let waiting: ((value: IteratorResult<Uint8Array>) => void) | undefined;
  let rejectWaiting: ((reason: unknown) => void) | undefined;
  let pending: Promise<IteratorResult<Uint8Array>> | undefined;
  let cancelled = false;
  let finished = false;
  let transaction: Promise<void> | undefined;
  const cancelledError = new Error('Export cancelled');
  async function deliver(value: IteratorResult<Uint8Array>): Promise<void> {
    if (cancelled) throw cancelledError;
    while (!waiting) {
      await new Promise<void>((resolve) => { notifyProducer = resolve; });
      if (cancelled) throw cancelledError;
    }
    waiting(value);
    waiting = undefined;
    rejectWaiting = undefined;
    pending = undefined;
  }
  let notifyProducer: (() => void) | undefined;
  function start() {
    transaction = getDb().transaction(async (tx) => {
      await tx.execute(sql`set transaction isolation level repeatable read read only`);
      const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
      const [erased] = await tx.select({ userId: erasureTombstones.userId }).from(erasureTombstones)
        .where(eq(erasureTombstones.userId, userId)).limit(1);
      if (!owner || erased) throw new Error('Export owner missing or erased');
      const pages = transactionPages(tx);
      const chunks = format === 'json' ? jsonExport(userId, pages) : csvArchive(userId, pages);
      for await (const chunk of chunks) await deliver({ done: false, value: chunk });
    }).then(async () => { finished = true; await deliver({ done: true, value: undefined }); }, (error: unknown) => {
      finished = true;
      rejectWaiting?.(error);
      rejectWaiting = undefined;
      waiting = undefined;
      pending = undefined;
    });
  }
  return new ReadableStream({
    async pull(controller) {
      try {
        if (!transaction) start();
        pending ??= new Promise<IteratorResult<Uint8Array>>((resolve, reject) => {
          waiting = resolve;
          rejectWaiting = reject;
          notifyProducer?.();
          notifyProducer = undefined;
        });
        const next = await pending;
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) { controller.error(error); }
    },
    async cancel() {
      cancelled = true;
      notifyProducer?.();
      if (!finished) rejectWaiting?.(cancelledError);
      await transaction;
    },
  }, { highWaterMark: 0 });
}

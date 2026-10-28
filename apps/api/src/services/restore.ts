import { eq, sql } from 'drizzle-orm';
import { getTableColumns } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import {
  accounts, assets, brokers, dividends, erasureTombstones, holdings, notaimports,
  portfolios, portfolioSnapshots, quoteOverrides, transactions, users,
} from '../db/schema.js';
import { EXPORT_SCHEMA_VERSION, losslessJson } from './export.js';
import { verifyRestoredHoldings } from './restore-replay.js';

// Internal worker/operator API only. The target must be an EXISTING owner;
// never restore users, passwords or sessions from an archive.
const tables = {
  brokers, assets, portfolios, accounts, notaImports: notaimports,
  dividends, transactions, holdings, overrides: quoteOverrides, snapshots: portfolioSnapshots,
} as const;
type Section = keyof typeof tables;
type Row = Record<string, unknown> & { id: string };
const owned: Section[] = ['portfolios', 'accounts', 'notaImports', 'dividends', 'transactions', 'holdings', 'overrides', 'snapshots'];
const bigIntMin = -(2n ** 63n);
const bigIntMax = 2n ** 63n - 1n;

function invalid(message: string): never { throw new Error(`INVALID_EXPORT: ${message}`); }
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Validates the entire versioned archive before making a database write.
 * Referential checks use exported IDs, never untrusted foreign-user rows. */
export function validateRestorePayload(value: unknown, userId: string): Record<Section, Row[]> {
  if (!object(value) || value.schemaVersion !== EXPORT_SCHEMA_VERSION || value.ownerId !== userId ||
      Object.keys(value).some((key) => !['schemaVersion', 'ownerId', ...Object.keys(tables)].includes(key))) {
    invalid('schema version, owner or top-level keys');
  }
  const payload = value as Record<string, unknown>;
  const result = {} as Record<Section, Row[]>;
  for (const [key, table] of Object.entries(tables) as [Section, (typeof tables)[Section]][]) {
    const section = payload[key];
    if (!Array.isArray(section)) invalid(`missing section ${key}`);
    const columns: Record<string, { dataType: string; notNull: boolean }> = getTableColumns(table);
    const seen = new Set<string>();
    result[key] = section.map((item: unknown) => {
      if (!object(item) || typeof item.id !== 'string' || !item.id || seen.has(item.id)) invalid(`${key}: invalid or duplicate ID`);
      seen.add(item.id);
      if (owned.includes(key) && item.userId !== userId) invalid(`${key}: foreign owner`);
      if (Object.keys(item).some((column) => !(column in columns))) invalid(`${key}: unknown field`);
      const row: Row = { id: item.id };
      for (const [name, column] of Object.entries(columns)) {
        const field = item[name];
        if (field === undefined) invalid(`${key}.${name}: missing field`);
        if (field === null) {
          if (column.notNull) invalid(`${key}.${name}: null in required field`);
          row[name] = null;
          continue;
        }
        if (column.dataType === 'bigint') {
          if (typeof field !== 'string' || !/^-?(0|[1-9]\d*)$/.test(field)) invalid(`${key}.${name}: invalid bigint`);
          const parsed = BigInt(field);
          if (parsed < bigIntMin || parsed > bigIntMax) invalid(`${key}.${name}: bigint outside signed 64-bit range`);
          row[name] = parsed;
        } else if (column.dataType === 'date') {
          if (typeof field !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(field) || Number.isNaN(Date.parse(field))) invalid(`${key}.${name}: invalid timestamp`);
          row[name] = new Date(field);
        } else { row[name] = field; }
      }
      return row;
    });
  }
  const ids = (section: Section) => new Set(result[section].map((row) => row.id));
  const accountIds = ids('accounts');
  const portfolioIds = ids('portfolios');
  const assetIds = ids('assets');
  const brokerIds = ids('brokers');
  const dividendIds = ids('dividends');
  const notaIds = ids('notaImports');
  const check = (section: Section, field: string, target: Set<string>) => {
    for (const row of result[section]) if (!target.has(row[field] as string)) invalid(`${section}.${field}: missing reference`);
  };
  check('accounts', 'portfolioId', portfolioIds);
  check('accounts', 'brokerId', brokerIds);
  check('notaImports', 'brokerId', brokerIds);
  for (const section of ['transactions', 'dividends', 'snapshots'] as Section[]) check(section, 'portfolioId', portfolioIds);
  for (const section of ['transactions', 'holdings'] as Section[]) check(section, 'accountId', accountIds);
  for (const section of ['transactions', 'dividends', 'holdings', 'overrides'] as Section[]) check(section, 'assetId', assetIds);
  for (const row of result.transactions) if (row.dividendId !== null && !dividendIds.has(row.dividendId as string)) invalid('transactions.dividendId: missing reference');
  for (const row of result.transactions) if (row.notaRefId !== null && !notaIds.has(row.notaRefId as string)) invalid('transactions.notaRefId: missing reference');
  const portfolioById = new Map(result.portfolios.map((p) => [p.id, p]));
  const accountById = new Map(result.accounts.map((a) => [a.id, a]));
  const dividendById = new Map(result.dividends.map((d) => [d.id, d]));
  for (const row of result.accounts) if (portfolioById.get(row.portfolioId as string)?.userId !== userId) invalid('account portfolio ownership');
  for (const section of ['transactions', 'dividends', 'snapshots'] as Section[]) {
    for (const row of result[section]) if (portfolioById.get(row.portfolioId as string)?.userId !== userId) invalid('portfolio ownership');
  }
  for (const row of result.transactions) {
    if (accountById.get(row.accountId as string)?.portfolioId !== row.portfolioId) invalid('transaction account/portfolio mismatch');
    if (row.dividendId !== null && dividendById.get(row.dividendId as string)?.portfolioId !== row.portfolioId) invalid('receipt portfolio mismatch');
  }
  verifyRestoredHoldings(result);
  return result;
}

/** Restore a complete export into an EMPTY existing account. Serializes with
 * erasure via the same row lock, rechecks tombstone in the write transaction.
 * Foreign catalog entries are inserted only when absent; existing shared data
 * is verified, never overwritten. All writes roll back on any failure. */
export async function restoreExport(userId: string, value: unknown): Promise<void> {
  const data = validateRestorePayload(value, userId);
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select id from users where id = ${userId} for update`);
    const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    const [tombstone] = await tx.select().from(erasureTombstones).where(eq(erasureTombstones.userId, userId)).limit(1);
    if (!owner || tombstone) throw new Error('RESTORE_FORBIDDEN: owner missing or erased');
    for (const section of owned) {
      const table = tables[section] as typeof portfolios;
      const [existing] = await tx.select({ id: table.id }).from(table).where(eq(table.userId, userId)).limit(1);
      if (existing) throw new Error('RESTORE_FORBIDDEN: target account is not empty');
    }
    for (const section of ['brokers', 'assets'] as const) {
      const table = tables[section];
      for (const row of data[section]) {
        const [stored] = await tx.select().from(table as typeof brokers).where(eq(table.id, row.id)).limit(1);
        if (stored) {
          if (losslessJson(stored) !== losslessJson(row)) {
            throw new Error(`RESTORE_CONFLICT: shared catalog ${section}/${row.id}`);
          }
        } else await tx.insert(table as typeof brokers).values(row as never);
      }
    }
    for (const section of owned) {
      const table = tables[section] as typeof portfolios;
      for (let start = 0; start < data[section].length; start += 200) {
        await tx.insert(table).values(data[section].slice(start, start + 200) as never);
      }
    }
  });
}

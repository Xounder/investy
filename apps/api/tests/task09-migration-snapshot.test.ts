import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function migrationFile(name: string) {
  return readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8');
}

describe('0004 trusted dividend receipt migration snapshot', () => {
  it('extends the predecessor losslessly and matches SQL, schema constraints and journal order', () => {
    const predecessor = JSON.parse(migrationFile('meta/0003_snapshot.json')) as Record<string, unknown>;
    const next = JSON.parse(migrationFile('meta/0004_snapshot.json')) as Record<string, unknown>;
    const expected = structuredClone(predecessor);
    expected.prevId = predecessor.id;
    expected.id = next.id;
    const tx = (expected.tables as Record<string, {
      columns: Record<string, unknown>; indexes: Record<string, unknown>; foreignKeys: Record<string, unknown>;
    }>)['public.transactions']!;
    tx.columns.dividend_id = { name: 'dividend_id', type: 'text', primaryKey: false, notNull: false };
    tx.indexes.transactions_dividend_account_idx = {
      name: 'transactions_dividend_account_idx', columns: [
        { expression: 'dividend_id', isExpression: false, asc: true, nulls: 'last' },
        { expression: 'account_id', isExpression: false, asc: true, nulls: 'last' },
      ], isUnique: true, concurrently: false, method: 'btree', with: {},
    };
    tx.foreignKeys.transactions_dividend_id_dividends_id_fk = {
      name: 'transactions_dividend_id_dividends_id_fk', tableFrom: 'transactions', tableTo: 'dividends',
      columnsFrom: ['dividend_id'], columnsTo: ['id'], onDelete: 'cascade', onUpdate: 'no action',
    };
    expect(next.id).not.toBe(predecessor.id);
    expect(next).toEqual(expected);
    const sql = migrationFile('0004_dividend_receipt_link.sql');
    expect(sql).toContain('ADD COLUMN "dividend_id" text');
    expect(sql).toContain('ON DELETE cascade');
    expect(sql).toContain('CREATE UNIQUE INDEX "transactions_dividend_account_idx"');
    const journal = JSON.parse(migrationFile('meta/_journal.json')) as { entries: Array<{ idx: number; tag: string }> };
    const predecessorEntries = journal.entries.filter((entry) => entry.tag === '0003_quote_previous_close');
    const receiptEntries = journal.entries.filter((entry) => entry.tag === '0004_dividend_receipt_link');
    expect(predecessorEntries).toHaveLength(1);
    expect(receiptEntries).toHaveLength(1);
    expect(predecessorEntries[0]).toMatchObject({ idx: 3, tag: '0003_quote_previous_close' });
    expect(receiptEntries[0]).toMatchObject({ idx: 4, tag: '0004_dividend_receipt_link' });
    expect(journal.entries.indexOf(receiptEntries[0]!)).toBe(journal.entries.indexOf(predecessorEntries[0]!) + 1);
  });
});

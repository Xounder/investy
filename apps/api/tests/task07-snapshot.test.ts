import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { quotes } from '../src/db/schema.js';

function migrationFile(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../drizzle/${name}`, import.meta.url)), 'utf8');
}

describe('TASK-07 migration snapshot', () => {
  it('preserves every predecessor object except the nullable quote previous close', () => {
    const predecessor = JSON.parse(migrationFile('meta/0002_snapshot.json')) as Record<string, unknown>;
    const successor = JSON.parse(migrationFile('meta/0003_snapshot.json')) as Record<string, unknown>;
    const originalQuotes = (predecessor.tables as Record<string, Record<string, unknown>>)['public.quotes']!;
    const nextQuotes = (successor.tables as Record<string, Record<string, unknown>>)['public.quotes']!;
    expect(successor.prevId).toBe(predecessor.id);
    expect(successor.id).not.toBe(predecessor.id);
    expect((nextQuotes.columns as Record<string, unknown>).previous_close_cents).toEqual({
      name: 'previous_close_cents', type: 'bigint', primaryKey: false, notNull: false,
    });
    const originalColumns = { ...nextQuotes.columns as Record<string, unknown> };
    delete originalColumns.previous_close_cents;
    expect(originalColumns).toEqual(originalQuotes.columns);
    expect({ ...nextQuotes, columns: originalColumns }).toEqual(originalQuotes);
    const otherMetadata = { ...successor };
    const oldMetadata = { ...predecessor };
    for (const metadata of [otherMetadata, oldMetadata]) {
      delete metadata.id;
      delete metadata.prevId;
      delete metadata.tables;
    }
    expect(otherMetadata).toEqual(oldMetadata);
    const tables = { ...(successor.tables as Record<string, unknown>), 'public.quotes': originalQuotes };
    expect(tables).toEqual(predecessor.tables);
    expect(migrationFile('meta/0003_snapshot.json').split('\n').length).toBeLessThanOrEqual(401);
    expect(migrationFile('0003_quote_previous_close.sql')).toContain('ADD COLUMN "previous_close_cents" bigint');
    const journal = JSON.parse(migrationFile('meta/_journal.json')) as { entries: Array<{ idx: number; tag: string }> };
    const entries = journal.entries.filter((entry) => entry.tag === '0003_quote_previous_close');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ idx: 3, tag: '0003_quote_previous_close' });
    expect(journal.entries[2]?.idx).toBe(2);
    expect(journal.entries[3]).toBe(entries[0]);
    expect(quotes.previousCloseCents.notNull).toBe(false);
  });
});

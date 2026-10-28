import { describe, expect, it, vi } from 'vitest';
import { Column, SQL } from 'drizzle-orm';
import { buildHoldingLots } from '../src/services/holding-lots.js';
import { replayJournalWithSales } from '../src/services/journal-money.js';
import type { TransactionTable } from '../src/db/schema.js';

const { holder } = vi.hoisted(() => ({ holder: { db: null as unknown } }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));

const accountId = '00000000-0000-4000-8000-000000000001';
function event(id: string, date: string, type: 'buy' | 'sell', qty: bigint, price: bigint, createdAt = date): TransactionTable {
  return {
    id, accountId, userId: 'alice', assetId: '00000000-0000-4000-8000-000000000003',
    portfolioId: '00000000-0000-4000-8000-000000000002', type, date: new Date(date),
    createdAt: new Date(createdAt), qty, unitPriceCents: price, feeCents: 0n,
    factor: null, amortRateCents: null, currency: 'BRL', fxRateToBRL: null,
  } as TransactionTable;
}

describe('TASK-05 chronological replay and display cohorts', () => {
  it('shows open acquisition cohorts after a partial sale without treating them as FIFO tax lots', () => {
    const first = event('a', '2025-01-01', 'buy', 6n, 1000n);
    const second = event('b', '2025-01-02', 'buy', 4n, 2000n);
    const sale = event('c', '2025-02-01', 'sell', 5n, 3000n);
    const holding = replayJournalWithSales([first, second, sale]).holding;
    const lots = buildHoldingLots([{ accountId, qty: holding.qty, costBasisCents: holding.costBasisCents, events: [first, second, sale] }]);
    expect(lots).toMatchObject([
      { transactionId: 'a', qty: 3n, costBasisCents: 4200n, currency: 'BRL' },
      { transactionId: 'b', qty: 2n, costBasisCents: 2800n, currency: 'BRL' },
    ]);
    expect(holding.realizedPnlCents).toBe(8000n);
    expect(buildHoldingLots([{ accountId, qty: 6n, costBasisCents: 6000n, events: [first] }]))
      .toMatchObject([{ transactionId: 'a', qty: 6n, costBasisCents: 6000n }]);
  });

  it('uses actual repository ordering and offset/limit for backdated same-date events and empty later pages', async () => {
    const { transactionRepository } = await import('../src/repositories/transactions.js');
    const input = [
      event('c', '2025-02-01', 'sell', 3n, 2000n),
      event('b', '2025-01-01', 'buy', 2n, 2000n, '2025-01-03'),
      event('a', '2025-01-01', 'buy', 4n, 1000n, '2025-01-03'),
      event('z', '2025-03-01', 'buy', 1n, 1000n),
    ];
    const captured: string[][] = [];
    holder.db = {
      select: () => ({ from: () => ({ where: () => ({
        orderBy: (...orders: SQL[]) => {
          const fields = orders.map((order) => {
            const column = order.queryChunks.find((chunk) => chunk instanceof Column) as Column;
            return { name: column.name, descending: order.queryChunks.some((chunk) =>
              chunk != null && 'value' in chunk && Array.isArray(chunk.value) && chunk.value.join('').toLowerCase().includes('desc')) };
          });
          captured.push(fields.map((f) => `${f.name}:${f.descending ? 'desc' : 'asc'}`));
          const sorted = [...input].sort((a, b) => {
            for (const field of fields) {
              const key = field.name === 'created_at' ? 'createdAt' : field.name;
              const left = a[key as keyof TransactionTable];
              const right = b[key as keyof TransactionTable];
              const comparison = left instanceof Date && right instanceof Date
                ? left.getTime() - right.getTime() : String(left).localeCompare(String(right));
              if (comparison !== 0) return field.descending ? -comparison : comparison;
            }
            return 0;
          });
          return { limit: (size: number) => ({ offset: async (skip: number) => sorted.slice(skip, skip + size) }) };
        },
      }) }) }),
    };
    const first = await transactionRepository.listPaged('alice', {}, 1, 2);
    const second = await transactionRepository.listPaged('alice', {}, 2, 2);
    const beyond = await transactionRepository.listPaged('alice', {}, 3, 2);
    expect(first.items.map((row) => row.id)).toEqual(['z', 'c']);
    expect(first.hasMore).toBe(true);
    expect(second.items.map((row) => row.id)).toEqual(['b', 'a']);
    expect(second.hasMore).toBe(false);
    expect(beyond).toEqual({ items: [], hasMore: false });
    expect(captured).toEqual(Array(3).fill(['date:desc', 'created_at:desc', 'id:desc']));
    const chronological = [...second.items].reverse().concat(first.items.slice().reverse());
    expect(chronological.map((row) => row.id)).toEqual(['a', 'b', 'c', 'z']);
    expect(replayJournalWithSales(chronological).holding).toMatchObject({ qty: 4n, costBasisCents: 5000n });
  });
});

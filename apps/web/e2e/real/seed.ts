import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type { Owner } from './owner';

type DbClient = {
  connect(): Promise<void>;
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
};
const apiRequire = createRequire(new URL('../../../api/package.json', import.meta.url));
const { Client } = apiRequire('pg') as { Client: new (options: { connectionString: string }) => DbClient };

export interface ObservedPoint { date: string; totalValueCents: string; ibov: number }

export async function seedFreshQuote(): Promise<() => Promise<void>> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url || !/(?:^|[_-])(?:test|e2e)(?:$|[_-])/i.test(decodeURIComponent(new URL(url).pathname.slice(1)))) {
    throw new Error('Dedicated E2E_DATABASE_URL required for market observations');
  }
  const db = new Client({ connectionString: url });
  const id = randomUUID();
  await db.connect();
  try {
    const result = await db.query('SELECT id FROM assets WHERE symbol = $1', ['PETR4']);
    if (!result.rows[0]) throw new Error('Isolated E2E database has no seeded PETR4 catalog asset');
    const now = new Date();
    await db.query('INSERT INTO quotes (id, asset_id, price_cents, previous_close_cents, currency, source, is_stale, fetched_at, valid_until) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, result.rows[0].id, '2550', '2500', 'BRL', 'e2e-fixture', false, now, new Date(now.getTime() + 15 * 60_000)]);
  } catch (error) { await db.end(); throw error; }
  return async () => {
    try { await db.query('DELETE FROM quotes WHERE id = $1', [id]); }
    finally { await db.end(); }
  };
}

// Three days in TWO months of the SAME quarter, all within the frontend's 3m
// window. The middle observation is preserved monthly, not quarterly.
function observationDates(now: Date): string[] {
  const year = now.getUTCFullYear(); const month = now.getUTCMonth();
  const quarterMonth = month % 3;
  const earlier = quarterMonth === 0 ? month - 2 : month - 1;
  const later = quarterMonth === 0 ? month - 1 : month;
  const businessDay = (value: Date) => {
    while (value.getUTCDay() === 0 || value.getUTCDay() === 6) value.setUTCDate(value.getUTCDate() - 1);
    return value;
  };
  const first = businessDay(new Date(Date.UTC(year, earlier, 15)));
  const middle = businessDay(new Date(Date.UTC(year, earlier + 1, 0)));
  const last = businessDay(quarterMonth === 0 ? new Date(Date.UTC(year, later + 1, 0))
    : new Date(Date.UTC(year, later, Math.min(now.getUTCDate(), 15))));
  if (last <= middle) throw new Error('Run observed-month E2E test after the first business day of the month');
  return [first, middle, last].map((day) => day.toISOString().slice(0, 10));
}

export async function seedComparableSnapshots(owner: Owner): Promise<{ points: ObservedPoint[]; cleanup: () => Promise<void> }> {
  const url = process.env.E2E_DATABASE_URL;
  if (!url || !/(?:^|[_-])(?:test|e2e)(?:$|[_-])/i.test(decodeURIComponent(new URL(url).pathname.slice(1)))) {
    throw new Error('Dedicated E2E_DATABASE_URL required for observed snapshots');
  }
  const identity = await owner.api.get('/api/v1/auth/me');
  if (!identity.ok()) throw new Error('Owner session unavailable for snapshot seed');
  const userId = (await identity.json() as { id: string }).id;
  const db = new Client({ connectionString: url });
  const ownBenchmarks: string[] = [];
  const points: ObservedPoint[] = [];
  let connected = false;
  try {
    await db.connect(); connected = true;
    for (const [index, day] of observationDates(new Date()).entries()) {
      const date = `${day}T12:00:00.000Z`;
      const value = String(7500 + index * 100);
      await db.query('INSERT INTO portfolio_snapshots (id, user_id, portfolio_id, date, total_value_cents, cost_basis_cents) VALUES ($1,$2,$3,$4,$5,$6)',
        [randomUUID(), userId, owner.portfolioId, date, value, '7500']);
      // The canonical reports API only accepts verified Yahoo-index IDs and
      // values stored in 1/10,000 index-point units.
      const id = `yahoo-index:IBOV:e2e:${randomUUID()}`;
      // Shared index date is globally unique. Reuse a real row if present;
      // never overwrite or remove another run's market observation.
      const inserted = await db.query('INSERT INTO benchmark_series (id, symbol, date, value) VALUES ($1,$2,$3,$4) ON CONFLICT (symbol, date) DO NOTHING RETURNING id',
        [id, 'IBOV', date, (100000 + index * 1000) * 10000]);
      if (inserted.rows.length) ownBenchmarks.push(id);
      const persisted = await db.query('SELECT id, value FROM benchmark_series WHERE symbol = $1 AND date = $2', ['IBOV', date]);
      const row = persisted.rows[0];
      if (!row) throw new Error('Persisted IBOV fixture observation missing');
      const raw = Number(row.value);
      const ibov = String(row.id).startsWith('yahoo-index:') ? raw / 10000 : raw;
      if (!String(row.id).startsWith('yahoo-index:IBOV:') || !(ibov > 0)) {
        throw new Error('Persisted IBOV observation lacks verified index units; use a fresh isolated E2E database');
      }
      points.push({ date: day, totalValueCents: value, ibov });
    }
  } catch (error) {
    try { if (connected) await db.query('DELETE FROM benchmark_series WHERE id = ANY($1::text[])', [ownBenchmarks]); }
    finally { if (connected) await db.end(); }
    throw error;
  }
  return { points, cleanup: async () => {
    try { await db.query('DELETE FROM benchmark_series WHERE id = ANY($1::text[])', [ownBenchmarks]); }
    finally { await db.end(); }
  } };
}

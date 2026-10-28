import { accounts, assets, brokers, dividends, erasureTombstones, holdings, notaimports,
  portfolios, portfolioSnapshots, quoteOverrides, sessions, transactions, users } from '../../src/db/schema.js';
import { whereFacts } from './sql-facts.js';
import { getTableColumns, SQL } from 'drizzle-orm';

type Row = Record<string, unknown> & { id: string };
type State = Map<unknown, Row[]>;
const owned: unknown[] = [portfolios, accounts, transactions, dividends, holdings, notaimports, portfolioSnapshots, quoteOverrides, sessions];
const refs: [unknown, string, unknown][] = [
  [accounts, 'portfolioId', portfolios], [accounts, 'brokerId', brokers],
  [notaimports, 'brokerId', brokers], [transactions, 'portfolioId', portfolios],
  [transactions, 'accountId', accounts], [transactions, 'assetId', assets],
  [transactions, 'dividendId', dividends], [dividends, 'portfolioId', portfolios],
  [dividends, 'assetId', assets], [holdings, 'accountId', accounts],
  [holdings, 'assetId', assets], [quoteOverrides, 'assetId', assets],
  [portfolioSnapshots, 'portfolioId', portfolios],
];
function containsGreaterThan(node: unknown): boolean {
  if (node instanceof SQL) return node.queryChunks.some(containsGreaterThan);
  if (Array.isArray(node)) return node.some(containsGreaterThan);
  if (node && typeof node === 'object' && 'value' in node && Array.isArray(node.value)) {
    return node.value.some((part: unknown) => typeof part === 'string' && part.includes('>'));
  }
  return false;
}

/** Transactional row store with owner predicates, FK checks, cascade and rollback.
 * Only the Drizzle operations used by TASK-13 are supported; NOT a PostgreSQL
 * replacement (no locking/scheduler or real migration execution). */
export class Task13Db {
  private state: State = new Map();
  failInsert?: unknown;
  failDelete = false;
  afterLock?: () => void | Promise<void>;
  readonly writes: string[] = [];
  readonly events: string[] = [];
  private pending: Promise<void> = Promise.resolve();

  seed(table: unknown, ...rows: Row[]): void {
    this.state.set(table, [...(this.state.get(table) ?? []), ...structuredClone(rows)]);
  }
  rows(table: unknown): Row[] { return structuredClone(this.state.get(table) ?? []); }
  private clone(source: State): State {
    return new Map([...source].map(([key, value]) => [key, structuredClone(value)]));
  }
  async transaction<T>(run: (tx: ReturnType<Task13Db['client']>) => Promise<T>): Promise<T> {
    // Serialize write transactions in this fake; a read-only export freezes its
    // state at the first SQL statement so external mutations cannot change it.
    let release!: () => void;
    const previous = this.pending;
    this.pending = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const draft = this.clone(this.state);
    const start = this.events.length;
    try {
      const result = await run(this.client(draft));
      if (!this.events.slice(start).includes('read-only')) this.state = draft;
      this.events.push('commit');
      return result;
    } catch (error) {
      this.events.push('rollback');
      throw error;
    } finally { release(); }
  }
  // Outside transactions, read the live state for authenticated settings routes.
  select() { return this.client(this.state).select(); }

  private client(data: State) {
    const matching = (table: unknown, predicate: unknown): Row[] => {
      const { columns, values } = whereFacts(predicate);
      const owner = values.find((v) => v === 'alice' || v === 'bob') as string | undefined;
      const first = values[0];
      const cursor = columns.includes('id') && columns.includes('user_id') ? values[values.length - 1] :
        (table === assets || table === brokers) ? first : undefined;
      const assetIds = new Set([transactions, dividends, holdings, quoteOverrides]
        .flatMap((t) => (data.get(t) ?? []).filter((r) => r.userId === owner).map((r) => r.assetId)));
      const brokerIds = new Set([accounts, notaimports]
        .flatMap((t) => (data.get(t) ?? []).filter((r) => r.userId === owner).map((r) => r.brokerId)));
      return (data.get(table) ?? []).filter((row) => {
        if (table === assets && owner) return assetIds.has(row.id) && row.id > String(cursor ?? '');
        if (table === brokers && owner) return brokerIds.has(row.id) && row.id > String(cursor ?? '');
        if (columns.includes('user_id') && row.userId !== owner) return false;
        if (columns.includes('id') && columns.includes('user_id') &&
          (cursor === '' || containsGreaterThan(predicate))) return row.id > String(cursor);
        for (const [index, column] of columns.entries()) {
          if (column === 'user_id') continue;
          const key = column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
          const found = row[key];
          const expected = values[index];
          if (found instanceof Date && expected instanceof Date ? found.getTime() !== expected.getTime() : found !== expected) return false;
        }
        return true;
      });
    };
    return {
      execute: async (statement: unknown) => {
        const readonly = JSON.stringify(statement).includes('read only');
        this.events.push(readonly ? 'read-only' : 'lock');
        await this.afterLock?.();
      },
      select: () => {
        let table: unknown;
        let predicate: unknown;
        let count = Infinity;
        let chronological = false;
        const query = {
          from(t: unknown) { table = t; return query; },
          where(p: unknown) { predicate = p; return query; },
          orderBy() { chronological = table === transactions; return query; },
          limit(n: number) { count = n; return query; },
          then(onSuccess: (rows: Row[]) => unknown) {
            return Promise.resolve(onSuccess(matching(table, predicate).sort((a, b) =>
              chronological ? (a.date as Date).getTime() - (b.date as Date).getTime() ||
                (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime() || a.id.localeCompare(b.id) : a.id.localeCompare(b.id)).slice(0, count)));
          },
        };
        return query;
      },
      insert: (table: unknown) => ({
        values: (value: Row | Row[]) => {
          const insert = (ignoreConflict: boolean) => {
            if (table === this.failInsert) throw new Error('injected insert failure');
            for (const row of Array.isArray(value) ? value : [value]) {
              const prior = (data.get(table) ?? []).find((r) => (r.id ?? r.userId) === (row.id ?? row.userId));
              if (prior) { if (ignoreConflict) continue; throw new Error('duplicate primary key'); }
              if (owned.includes(table) && !(data.get(users) ?? []).some((r) => r.id === row.userId)) throw new Error('missing owner FK');
              for (const [source, field, target] of refs) {
                if (source === table && row[field] != null && !(data.get(target) ?? []).some((r) => r.id === row[field])) throw new Error(`missing ${field} FK`);
              }
              const complete: Row = { ...row };
              const columns = getTableColumns(table as typeof transactions);
              for (const [name, column] of Object.entries(columns)) {
                if (complete[name] !== undefined) continue;
                complete[name] = column.dataType === 'date' ? new Date('2026-04-20T12:00:00.000Z') :
                  column.notNull && column.dataType === 'bigint' ? 0n :
                    name === 'source' ? 'manual' : null;
              }
              data.set(table, [...(data.get(table) ?? []), structuredClone(complete)]);
              this.writes.push(table === erasureTombstones ? 'tombstone' : table === users ? 'user' :
                table === assets ? 'assets' : table === brokers ? 'brokers' :
                  table === portfolios ? 'portfolios' : table === accounts ? 'accounts' :
                    table === notaimports ? 'notaImports' : table === dividends ? 'dividends' :
                      table === transactions ? 'transactions' : table === holdings ? 'holdings' :
                        table === quoteOverrides ? 'overrides' : 'snapshots');
            }
          };
          return { then: (resolve: () => unknown, reject: (error: unknown) => unknown) => {
            try { insert(false); resolve?.(); } catch (error) { reject(error); }
          },
            returning: async () => { insert(false); return (data.get(table) ?? []).slice(-1); },
            onConflictDoNothing: async () => { insert(true); } };
        },
      }),
      update: (table: unknown) => ({ set: (patch: Row) => ({ where: (predicate: unknown) => {
        // Drizzle updates execute both with returning() and when directly
        // awaited. Journal sale-P&L updates use the latter form.
        let applied: Row[] | undefined;
        const run = () => {
          if (!applied) {
            applied = matching(table, predicate);
            for (const row of applied) Object.assign(row, patch);
          }
          return applied;
        };
        return { returning: async () => run(),
          then: (resolve: (rows: Row[]) => unknown, reject: (error: unknown) => unknown) => {
            try { resolve(run()); } catch (error) { reject(error); }
          } };
      } }) }),
      delete: (table: unknown) => ({ where: (predicate: unknown) => ({ returning: async () => {
        if (this.failDelete) throw new Error('injected delete failure');
        const deleting = matching(table, predicate);
        if (table === users) {
          for (const ownedTable of owned) data.set(ownedTable, (data.get(ownedTable) ?? []).filter((r) => !deleting.some((u) => u.id === r.userId)));
        }
        data.set(table, (data.get(table) ?? []).filter((r) => !deleting.includes(r)));
        this.writes.push('delete-user');
        return deleting;
      } }) }),
    };
  }
}

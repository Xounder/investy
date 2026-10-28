import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { sessions, users } from '../src/db/schema.js';
import { hashSessionToken, createSessionToken } from '../src/lib/session.js';
import { resetRateLimitStore } from '../src/middleware/rate-limit.js';
import { whereFacts } from './helpers/sql-facts.js';

type Row = Record<string, unknown>;
const { store } = vi.hoisted(() => ({ store: { db: null as unknown } }));
vi.mock('../src/db/client.js', () => ({ getDb: () => store.db }));

/** DB boundary only: Drizzle queries hit rows written by the real routes. */
class AuthRows {
  readonly people: Row[] = [];
  readonly tickets: Row[] = [];
  failSessionInsert = false;
  readonly events: string[] = [];
  async transaction<T>(run: (tx: AuthRows) => Promise<T>): Promise<T> {
    const people = this.people.map((row) => ({ ...row }));
    const tickets = this.tickets.map((row) => ({ ...row }));
    try { const result = await run(this); this.events.push('commit'); return result; }
    catch (error) {
      this.people.splice(0, this.people.length, ...people);
      this.tickets.splice(0, this.tickets.length, ...tickets);
      this.events.push('rollback');
      throw error;
    }
  }
  private rows(table: unknown) { return table === users ? this.people : table === sessions ? this.tickets : []; }
  select(fields?: Record<string, unknown>) {
    let table: unknown;
    let predicate: unknown;
    const query = {
      from(t: unknown) { table = t; return query; },
      where(p: unknown) { predicate = p; return query; },
      limit() { return query; },
      then: (resolve: (rows: Row[]) => unknown) => {
        const { columns, values } = whereFacts(predicate);
        const matched = this.rows(table).filter((row) => columns.every((column, index) => {
          const key = column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
          return row[key] === values[index];
        }));
        return Promise.resolve(resolve(matched.slice(0, 1).map((row) => fields ?
          Object.fromEntries(Object.keys(fields).map((key) => [key, row[key]])) : { ...row })));
      },
    };
    return query;
  }
  insert(table: unknown) {
    return { values: (value: Row) => {
      const target = this.rows(table);
      if (table === sessions && this.failSessionInsert) throw new Error('session store unavailable');
      if (table === sessions && !this.people.some((row) => row.id === value.userId)) throw new Error('missing owner FK');
      const row: Row = { createdAt: new Date('2026-01-01T00:00:00Z'), ...value };
      target.push(row);
      return { returning: async (fields?: Record<string, unknown>) => [fields ?
        Object.fromEntries(Object.keys(fields).map((key) => [key, row[key]])) : row] };
    } };
  }
  delete(table: unknown) {
    return { where: async (predicate: unknown) => {
      const { columns, values } = whereFacts(predicate);
      const target = this.rows(table);
      for (let index = target.length - 1; index >= 0; index--) {
        if (columns.every((column, i) => target[index]![column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] === values[i])) target.splice(index, 1);
      }
    } };
  }
  update(table: unknown) {
    return { set: (patch: Row) => ({ where: (predicate: unknown) => ({ returning: async () => {
      const { columns, values } = whereFacts(predicate);
      const matched = this.rows(table).filter((row) => columns.every((column, i) =>
        row[column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] === values[i]));
      for (const row of matched) Object.assign(row, patch);
      return matched;
    } }) }) };
  }
}

let db: AuthRows;
const post = (path: string, payload: unknown, cookie?: string) => app.request(`/api/v1/auth/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  body: JSON.stringify(payload),
});
const me = (cookie: string) => app.request('/api/v1/auth/me', { headers: { Cookie: cookie } });
const cookieOf = (response: Response) => response.headers.get('set-cookie')!.split(';')[0]!;

beforeEach(() => { db = new AuthRows(); store.db = db; resetRateLimitStore(); });

describe('auth HTTP / actual session repository / row persistence boundary', () => {
  it('registers a normalized owner and persists an opaque digest before issuing a usable cookie', async () => {
    const registered = await post('register', { email: 'A@Example.com', password: 'password123', name: 'Alice' });
    expect(registered.status).toBe(201);
    expect(await registered.json()).toMatchObject({ email: 'a@example.com', name: 'Alice' });
    const cookie = cookieOf(registered);
    expect(registered.headers.get('set-cookie')).toMatch(/httpOnly; sameSite=lax; path=\/; maxAge=604800/i);
    expect(db.tickets).toHaveLength(1);
    expect(db.tickets[0]).toMatchObject({ userId: db.people[0]?.id, token: hashSessionToken(cookie.slice(8)) });
    expect(db.tickets[0]?.token).not.toBe(cookie.slice(8));
    expect(db.people[0]?.passwordHash).not.toBe('password123');
    const response = await me(cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ email: 'a@example.com', name: 'Alice' });
    expect((await me(`session=${createSessionToken(String(db.people[0]?.id))}`)).status).toBe(401);
  });

  it('logs in with normalized email, keeps independent revocable sessions, and denies expired rows', async () => {
    const register = await post('register', { email: 'A@Example.com', password: 'password123' });
    const first = cookieOf(register);
    const login = await post('login', { email: 'A@EXAMPLE.COM', password: 'password123' });
    expect(login.status).toBe(200);
    const second = cookieOf(login);
    expect(second).not.toBe(first);
    expect(db.tickets).toHaveLength(2);
    expect((await me(second)).status).toBe(200);
    const logout = await post('logout', {}, first);
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toContain('maxAge=0');
    expect(db.tickets).toHaveLength(1);
    expect((await me(first)).status).toBe(401);
    expect((await me(second)).status).toBe(200);
    db.tickets[0]!.expiresAt = new Date(0);
    expect((await me(second)).status).toBe(401);
    expect((await post('login', { email: 'a@example.com', password: 'wrong' })).status).toBe(401);
    expect(db.tickets).toHaveLength(1);
  });

  it('never issues a cookie or leaves a new user when session persistence fails', async () => {
    db.failSessionInsert = true;
    const failed = await post('register', { email: 'a@example.com', password: 'password123' });
    expect(failed.status).toBe(500);
    expect(failed.headers.get('set-cookie')).toBeNull();
    expect(db.people).toEqual([]);
    expect(db.tickets).toEqual([]);
    expect(db.events).toContain('rollback');
  });

  it('upgrades a valid legacy raw-token row in place, retaining its cookie and allowing logout', async () => {
    const registered = await post('register', { email: 'a@example.com', password: 'password123' });
    const owner = String(db.people[0]?.id);
    const legacy = createSessionToken(owner);
    db.tickets.push({ id: 'legacy', userId: owner, token: legacy, expiresAt: new Date(Date.now() + 60_000) });
    expect((await me(`session=${legacy}`)).status).toBe(200);
    expect(db.tickets.find((row) => row.id === 'legacy')?.token).toBe(hashSessionToken(legacy));
    expect((await post('logout', {}, `session=${legacy}`)).status).toBe(200);
    expect((await me(`session=${legacy}`)).status).toBe(401);
    expect((await me(cookieOf(registered))).status).toBe(200);
    const wrong = createSessionToken(owner, 60_000);
    db.tickets.push({ id: 'foreign', userId: 'other-user', token: wrong, expiresAt: new Date(Date.now() + 60_000) });
    expect((await me(`session=${wrong}`)).status).toBe(401);
    expect(db.tickets.find((row) => row.id === 'foreign')?.token).toBe(wrong);
  });
});

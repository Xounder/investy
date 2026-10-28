import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { assets, quoteOverrides, users } from '../src/db/schema.js';
import { whereFacts } from './helpers/sql-facts.js';

const { holder, findSession } = vi.hoisted(() => ({ holder: { db: null as unknown }, findSession: vi.fn() }));
vi.mock('../src/db/client.js', () => ({ getDb: () => holder.db }));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: findSession } }));

type Person = { id: string; email: string; name: string; passwordHash: string; createdAt: Date };
const people: Person[] = [];
const overrides = [
  { id: 'o1', userId: 'alice', assetId: 'a1', priceCents: 42n, currency: 'BRL', createdAt: new Date('2026-01-01') },
  { id: 'o2', userId: 'bob', assetId: 'a2', priceCents: 99n, currency: 'BRL', createdAt: new Date('2026-01-02') },
];
const catalog = [
  { id: 'a1', symbol: 'INACTIVE3', name: 'Inactive asset' },
  { id: 'a2', symbol: 'PRIVATE4', name: 'Another asset' },
];
const queries: { table: unknown; fields: unknown; where: unknown; joined: unknown; on: unknown }[] = [];
let writes = 0;
function publicPerson(person: Person) {
  return { id: person.id, email: person.email, name: person.name, createdAt: person.createdAt };
}

holder.db = {
  select(fields: unknown) {
    const query = { table: null as unknown, fields, where: null as unknown, joined: null as unknown, on: null as unknown };
    queries.push(query);
    const chain = {
      from(table: unknown) { query.table = table; return chain; },
      innerJoin(table: unknown, on: unknown) { query.joined = table; query.on = on; return chain; },
      where(where: unknown) { query.where = where; return chain; },
      limit() { return chain; },
      then(resolve: (rows: unknown[]) => unknown) {
        const owner = whereFacts(query.where).values[0];
        const rows = query.table === users ? people.filter((p) => p.id === owner).map(publicPerson) :
          overrides.filter((o) => o.userId === owner).map((o) => ({ ...o, symbol: catalog.find((a) => a.id === o.assetId)?.symbol, assetName: catalog.find((a) => a.id === o.assetId)?.name }));
        return Promise.resolve(resolve(rows));
      },
    };
    return chain;
  },
  update(table: unknown) {
    expect(table).toBe(users);
    let patch: { name: string; email: string };
    let predicate: unknown;
    return {
      set(value: typeof patch) { patch = value; return this; },
      where(value: unknown) { predicate = value; return this; },
      async returning(fields: Record<string, unknown>) {
        expect(Object.keys(fields).sort()).toEqual(['createdAt', 'email', 'id', 'name']);
        const owner = whereFacts(predicate).values[0];
        if (people.some((p) => p.email === patch.email && p.id !== owner)) throw { code: '23505', constraint: 'users_email_idx' };
        const person = people.find((p) => p.id === owner);
        if (!person) return [];
        writes++;
        Object.assign(person, patch);
        return [publicPerson(person)];
      },
    };
  },
};

function request(owner: string, path: string, body?: unknown) {
  return app.request(`/api/v1${path}`, {
    method: body === undefined ? 'GET' : 'PATCH',
    headers: { Cookie: `session=${createSessionToken(owner)}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  people.splice(0, people.length,
    { id: 'alice', email: 'alice@example.com', name: 'Alice', passwordHash: 'secret-a', createdAt: new Date('2026-01-01') },
    { id: 'bob', email: 'bob@example.com', name: 'Bob', passwordHash: 'secret-b', createdAt: new Date('2026-01-02') });
  queries.length = 0;
  writes = 0;
  findSession.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
});

describe('TASK-14 settings contracts', () => {
  it('persists normalized email and name on the session owner only, with the GET /me public shape', async () => {
    const response = await request('alice', '/auth/me', { name: '  New Name  ', email: 'New@Example.COM' });
    expect(response.status).toBe(200);
    const updated = await response.json();
    expect(updated).toEqual({ id: 'alice', name: 'New Name', email: 'new@example.com', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(await (await request('alice', '/auth/me')).json()).toEqual(updated);
    expect(people[1]?.email).toBe('bob@example.com');
    expect(people[0]?.passwordHash).toBe('secret-a');
    expect(JSON.stringify(updated)).not.toContain('secret');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('rejects invalid, extra, duplicate and unauthenticated edits without changing records', async () => {
    for (const body of [{ name: '', email: 'valid@example.com' }, { name: 'Good', email: 'bad' },
      { name: 'Good', email: 'valid@example.com', id: 'bob' }, { name: 'x'.repeat(121), email: 'valid@example.com' }]) {
      expect((await request('alice', '/auth/me', body)).status).toBe(400);
    }
    const conflict = await request('alice', '/auth/me', { name: 'Good', email: 'BOB@EXAMPLE.COM' });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: { code: 'EMAIL_EXISTS', message: 'Email already registered' } });
    expect(writes).toBe(0);
    expect((await app.request('/api/v1/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X', email: 'x@example.com' }) })).status).toBe(401);
    findSession.mockResolvedValue(null);
    expect((await request('alice', '/auth/me', { name: 'X', email: 'x@example.com' })).status).toBe(401);
  });

  it('returns only owner overrides and directly joined symbols even outside catalog pages', async () => {
    const response = await request('alice', '/settings/overrides');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ overrides: [{ id: 'o1', userId: 'alice', assetId: 'a1', priceCents: '42', currency: 'BRL', createdAt: '2026-01-01T00:00:00.000Z', symbol: 'INACTIVE3', assetName: 'Inactive asset' }] });
    expect(queries).toHaveLength(1);
    expect(queries[0]?.table).toBe(quoteOverrides);
    expect(queries[0]?.joined).toBe(assets);
    expect(whereFacts(queries[0]?.on)).toMatchObject({ columns: ['asset_id', 'id'] });
    expect(whereFacts(queries[0]?.where).values).toEqual(['alice']);
    expect((await request('bob', '/settings/overrides')).status).toBe(200);
    expect((await app.request('/api/v1/settings/overrides')).status).toBe(401);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/client.js', () => ({ getDb: vi.fn() }));

import app from '../src/app.js';
import { getDb } from '../src/db/client.js';
import { beginBoot, completeBoot } from '../src/routes/ready.js';

describe('database-backed readiness', () => {
  beforeEach(() => vi.mocked(getDb).mockReset());

  it('probes the database without writing and returns a stable ready contract', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
    vi.mocked(getDb).mockReturnValue({ execute } as unknown as ReturnType<typeof getDb>);
    const response = await app.request('/api/ready');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ready' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(execute.mock.calls[0]?.[0])).toContain('SELECT 1');
  });

  it('fails closed for unavailable storage without exposing connection secrets', async () => {
    const secret = 'postgresql://some-user:private-password@db:5432/private';
    const execute = vi.fn().mockRejectedValue(new Error(secret));
    vi.mocked(getDb).mockReturnValue({ execute } as unknown as ReturnType<typeof getDb>);
    const response = await app.request('/api/ready');
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ status: 'unavailable' });
    expect(body).not.toContain(secret);
    expect((await app.request('/api/health')).status).toBe(200);
  });

  it('does not claim readiness when boot seeding has not succeeded', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
    vi.mocked(getDb).mockReturnValue({ execute } as unknown as ReturnType<typeof getDb>);
    beginBoot();
    const pending = await app.request('/api/ready');
    expect(pending.status).toBe(503);
    expect(execute).not.toHaveBeenCalled();
    completeBoot();
    expect((await app.request('/api/ready')).status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
  });

});

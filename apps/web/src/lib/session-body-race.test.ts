import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api';
import { importApi } from './imports';
import { downloadExport } from './settings';
import { rotateSessionEpoch } from './session-boundary';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function deferBody<T>(response: Response, method: 'json' | 'blob') {
  let finish!: (value: T) => void;
  let started!: () => void;
  const body = new Promise<T>((resolve) => { finish = resolve; });
  const reading = new Promise<void>((resolve) => { started = resolve; });
  vi.spyOn(response, method).mockImplementation((() => { started(); return body; }) as never);
  return { finish, reading };
}

describe('response bodies cannot cross a browser owner transition', () => {
  it.each([
    { path: '/v1/holdings', method: 'GET', status: 200, data: { holdings: ['old-owner'] } },
    { path: '/v1/transactions', method: 'POST', status: 201, data: { id: 'old-owner-write' } },
    { path: '/v1/holdings', method: 'GET', status: 400, data: { error: { message: 'old-owner-error' } } },
  ])('rejects delayed JSON for $method $path ($status) without returning old data', async ({ path, method, status, data }) => {
    const response = new Response(null, { status });
    const { reading, finish } = deferBody<typeof data>(response, 'json');
    vi.stubGlobal('fetch', vi.fn(async () => response));
    const result = apiFetch(path, method === 'POST' ? { method: 'POST', body: '{}' } : undefined);
    await reading;
    rotateSessionEpoch();
    finish(data);
    await expect(result).rejects.toThrow('Sessão alterada');
  });

  it.each([200, 400])('does not return a delayed multipart response after owner switch (HTTP %i)', async (status) => {
    const response = new Response(null, { status });
    const { reading, finish } = deferBody<Record<string, unknown>>(response, 'json');
    vi.stubGlobal('fetch', vi.fn(async () => response));
    const result = importApi.csv(new File(['type,date'], 'entries.csv', { type: 'text/csv' }));
    await reading;
    rotateSessionEpoch();
    finish(status === 200 ? { created: 1 } : { error: { message: 'old-owner-error' } });
    await expect(result).rejects.toThrow('Sessão alterada');
  });

  it('never creates a URL or clicks a download for a ZIP body read after logout', async () => {
    const response = new Response(null, { headers: { 'Content-Type': 'application/zip' } });
    const { reading, finish } = deferBody<Blob>(response, 'blob');
    vi.stubGlobal('fetch', vi.fn(async () => response));
    const create = vi.fn(() => 'blob:old-owner');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const result = downloadExport('csv');
    await reading;
    rotateSessionEpoch();
    finish(new Blob(['private export']));
    await expect(result).rejects.toThrow('Sessão alterada');
    expect(create).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });

  it('rejects delayed export error JSON as stale rather than surfacing a previous owner error', async () => {
    const response = new Response(null, { status: 503 });
    const { reading, finish } = deferBody<{ error: { message: string } }>(response, 'json');
    vi.stubGlobal('fetch', vi.fn(async () => response));
    const result = downloadExport('json');
    await reading;
    rotateSessionEpoch();
    finish({ error: { message: 'old-owner-error' } });
    await expect(result).rejects.toThrow('Sessão alterada');
  });
});

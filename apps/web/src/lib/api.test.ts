import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('API error normalization', () => {
  it('retains nested validation code, message, fields and HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
      code: 'VALIDATION', message: 'Invalid request body', fields: ['qty: Expected positive integer'],
    } }), { status: 400, headers: { 'Content-Type': 'application/json' } })));
    await expect(apiFetch('/v1/transactions')).rejects.toEqual({
      status: 400, code: 'VALIDATION', message: 'Invalid request body', fields: ['qty: Expected positive integer'],
    });
  });

  it('preserves legacy top-level errors and fallback for malformed bodies', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'LEGACY', message: 'Old error' }), { status: 409 }))
      .mockResolvedValueOnce(new Response('not JSON', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiFetch('/v1/portfolios')).rejects.toEqual({ status: 409, code: 'LEGACY', message: 'Old error' });
    await expect(apiFetch('/v1/portfolios')).rejects.toEqual({ status: 503, message: 'Erro 503', code: undefined });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/portfolios', expect.objectContaining({ credentials: 'include' }));
  });
});

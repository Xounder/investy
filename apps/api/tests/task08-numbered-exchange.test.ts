import { describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { parseNota } from '../src/services/import/nota-parser.js';

const { findSession, getDb } = vi.hoisted(() => ({ findSession: vi.fn(), getDb: vi.fn() }));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: findSession } }));
vi.mock('../src/db/client.js', () => ({ getDb }));

const base = 'Corretora: XP\nNúmero Nota: 581\nData Pregão: 18/10/2026\nC PETR4 2 10,50\n';

describe('TASK-08 unsupported numbered exchange trades', () => {
  it('rejects unknown numbered exchange layouts without a financial section or declared total', () => {
    for (const line of [
      '3-BM&F V VISTA VALE3 1 10,50 10,50',
      '4-OUTRA C VISTA VALE3 1 10,50 10,50',
      '5 BM&F V VISTA VALE3 1 10,50 10,50',
    ]) expect(() => parseNota(base + line, 'text')).toThrow(/Registro financeiro não reconhecido na linha 5/);
  });

  it('rejects a mixed-valid/unsupported multipart preview before DB access; no token or journal write is possible', async () => {
    getDb.mockClear();
    findSession.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
    const form = new FormData();
    form.set('file', new File([base + '3-BM&F V VISTA VALE3 1 10,50 10,50'], 'nota.txt'));
    const headers = { Cookie: `session=${createSessionToken('alice')}` };
    const response = await app.request('/api/v1/transactions/import/nota/preview', {
      method: 'POST', headers, body: form,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: {
      code: 'VALIDATION', message: 'Registro financeiro não reconhecido na linha 5',
    } });
    expect(getDb).not.toHaveBeenCalled();
    const confirm = await app.request('/api/v1/transactions/import/nota/confirm', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ importToken: '00000000-0000-4000-8000-000000000019' }),
    });
    expect(confirm.status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });
});

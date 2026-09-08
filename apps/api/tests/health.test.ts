import { describe, expect, it } from 'vitest';

import app from '../src/app.js';

describe('GET /api/health', () => {
  it('returns 200 with an ok payload', async () => {
    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok' });
  });
});
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../src/app.js';
import { createSessionToken } from '../src/lib/session.js';
import { incomeReport } from '../src/services/reports-income.js';
import { ReportWindowError } from '../src/repositories/reports.js';

const mock = vi.hoisted(() => ({ session: vi.fn(), performance: vi.fn(), income: vi.fn(), cdi: vi.fn() }));
vi.mock('../src/repositories/sessions.js', () => ({ sessionRepository: { findByToken: mock.session } }));
vi.mock('../src/repositories/reports.js', () => ({ readPerformance: mock.performance, readIncome: mock.income,
  ReportWindowError: class ReportWindowError extends Error {} }));
vi.mock('../src/services/market-data/cdi-index.js', () => ({ loadCdiIndex: mock.cdi }));

const portfolioId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const url = (route: string) => `/api/v1/reports/${route}?portfolioId=${portfolioId}`;
const request = (user: string | null, path: string) => app.request(path, user
  ? { headers: { Cookie: `session=${createSessionToken(user)}` } } : undefined);
beforeEach(() => {
  vi.clearAllMocks();
  mock.session.mockResolvedValue({ expiresAt: new Date(Date.now() + 60000) });
  mock.performance.mockImplementation(async (user: string) => user === 'alice'
    ? { snapshots: [], benchmarks: [], historyBeforeWindow: false } : null);
  mock.income.mockImplementation(async (user: string) => user === 'alice'
    ? incomeReport(portfolioId, '2026-12-31', '2026-12-31', { paid: [], sales: [], receipts: [], catalog: [] }) : null);
  mock.cdi.mockResolvedValue({ symbol: 'CDI', source: 'BCB_SGS_12', indexUnit: 'base_100', rateUnit: 'percent_per_business_day',
    coverage: 'UNAVAILABLE', requestedStartDate: '2026-01-01', requestedEndDate: '2026-04-01',
    baseDate: null, lastObservationDate: null, indexSeries: [] });
});

describe('mounted canonical reports', () => {
  it('authenticates, validates both contracts and hides foreign portfolios before provider access', async () => {
    expect((await request(null, `${url('performance')}&granularity=month`)).status).toBe(401);
    for (const path of [url('performance'), `${url('performance')}&granularity=week`,
      `${url('performance')}&granularity=month&extra=1`,
      `${url('income')}&from=2026-02-30&to=2026-03-01`,
      `${url('income')}&from=2026-01-01&to=2026-02-01&assetPage=0`,
      `${url('income')}&from=2026-03-02&to=2026-03-01`]) {
      const res = await request('alice', path);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION' } });
    }
    for (const path of [`${url('performance')}&granularity=month`,
      `${url('income')}&from=2026-01-01&to=2026-02-01`]) {
      const res = await request('bob', path);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Portfolio not found' } });
    }
    expect(mock.cdi).not.toHaveBeenCalled();
    expect(mock.performance).toHaveBeenCalledWith('bob', portfolioId, expect.any(Date), expect.any(Date));
    expect(mock.income).toHaveBeenCalledWith('bob', portfolioId, expect.any(Date), expect.any(Date),
      '2026-01-01', '2026-02-01', 1, 1);
  });

  it('returns truthful empty period metadata and inclusive calendar boundaries', async () => {
    const performance = await request('alice', `${url('performance')}&granularity=quarter`);
    expect(performance.status).toBe(200);
    expect(await performance.json()).toMatchObject({ convention: 'OBSERVED_VALUE_INDEX', baseDate: null,
      periods: [], benchmarkCoverage: { CDI: { unavailable: true } } });
    expect(mock.cdi).toHaveBeenCalledWith('3m');
    const income = await request('alice', `${url('income')}&from=2026-12-31&to=2026-12-31`);
    expect(income.status).toBe(200);
    expect(await income.json()).toMatchObject({ totals: { incomeCents: '0' }, periods: [], totalsIncomplete: false });
    expect(mock.income).toHaveBeenCalledWith('alice', portfolioId, new Date('2026-12-31'),
      new Date('2027-01-01'), '2026-12-31', '2026-12-31', 1, 1);
  });

  it('returns explicit validation errors for overly dense windows rather than truncated performance', async () => {
    mock.performance.mockRejectedValueOnce(new ReportWindowError('Snapshot window exceeds supported observation density'));
    const res = await request('alice', `${url('performance')}&granularity=month`);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION', fields: ['portfolioId'] } });
  });
});

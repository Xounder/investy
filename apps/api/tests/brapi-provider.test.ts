import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { BrapiProvider } from '../src/services/market-data/brapi.js';
import { ProviderRegistry } from '../src/services/market-data/quote-provider.js';

/** Fixture API key used only to detect leakage in URLs, headers, and logs. */
const BRAPI_KEY = 'brapi-test-secret-key';

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}

function headersOf(init: unknown): Record<string, string> {
  return ((init as RequestInit).headers ?? {}) as Record<string, string>;
}

describe('BrapiProvider API key handling', () => {
  const fetchMock = vi.fn();
  const originalEnvKey = process.env.BRAPI_API_KEY;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.BRAPI_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalEnvKey === undefined) {
      delete process.env.BRAPI_API_KEY;
    } else {
      process.env.BRAPI_API_KEY = originalEnvKey;
    }
  });

  it('authenticates via Authorization header and keeps the key out of the URL (quote endpoint)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [{ symbol: 'PETR4', regularMarketPrice: 41.18, currency: 'BRL' }],
      }),
    );

    const provider = new BrapiProvider(BRAPI_KEY);
    const quote = await provider.fetchQuote('PETR4', 'acao');

    expect(quote).toEqual({
      priceCents: 4118n,
      currency: 'BRL',
      source: 'brapi',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('https://brapi.dev/api/quote/PETR4');
    expect(String(url)).not.toContain('token=');
    expect(String(url)).not.toContain(BRAPI_KEY);
    expect(headersOf(init).Authorization).toBe(`Bearer ${BRAPI_KEY}`);
  });

  it('keeps the key out of the URL on the indicators endpoint too', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [{ symbol: 'USDBRL', name: 'USD/BRL', regularMarketPrice: 5.25, currency: 'BRL' }],
      }),
    );

    const provider = new BrapiProvider(BRAPI_KEY);
    const quote = await provider.fetchQuote('USDBRL', 'indice');

    expect(quote?.priceCents).toBe(525n);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('https://brapi.dev/api/v2/quote/USDBRL');
    expect(String(url)).not.toContain('token=');
    expect(String(url)).not.toContain(BRAPI_KEY);
    expect(headersOf(init).Authorization).toBe(`Bearer ${BRAPI_KEY}`);
  });

  it('sends no Authorization header when no key is configured', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [{ symbol: 'PETR4', regularMarketPrice: 10, currency: 'BRL' }],
      }),
    );

    const provider = new BrapiProvider();
    const quote = await provider.fetchQuote('PETR4', 'acao');

    expect(quote?.priceCents).toBe(1000n);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).not.toContain('token=');
    expect(headersOf(init).Authorization).toBeUndefined();
  });

  it('never surfaces the key in provider failure logs, even when the error embeds the request URL', async () => {
    // Mimics runtimes/clients that embed the full request URL in the error message.
    fetchMock.mockImplementation((url: string) =>
      Promise.reject(new TypeError(`fetch failed: ${url}`)),
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const registry = new ProviderRegistry();
      registry.register('acao', new BrapiProvider(BRAPI_KEY));

      const quote = await registry.fetchWithFallback('PETR4', 'acao');

      expect(quote).toBeNull();
      expect(warnSpy).toHaveBeenCalledTimes(1);

      const logged = warnSpy.mock.calls
        .flatMap((args) => args.map((arg) => String(arg)))
        .join(' ');
      expect(logged).toContain('fetch failed');
      expect(logged).not.toContain(BRAPI_KEY);
      expect(logged).not.toContain('token=');
    } finally {
      warnSpy.mockRestore();
    }
  });
});

import { URL } from 'node:url';

// Install ONLY in the dedicated test launcher before importing the compiled
// server. Never intercept localhost, the app API, PostgreSQL, or auth.
export function installExternalFixtures() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.protocol === 'https:' && url.hostname === 'brapi.dev' &&
      url.pathname === '/api/quote/PETR4') {
      return globalThis.Response.json({ results: [{ symbol: 'PETR4', regularMarketPrice: 25.5,
        regularMarketPreviousClose: 25, currency: 'BRL' }] });
    }
    const match = url.protocol === 'https:' && url.hostname === 'api.bcb.gov.br' &&
      /^\/dados\/serie\/bcdata\.sgs\.(11|12)\/dados$/.exec(url.pathname);
    if (match && url.searchParams.get('formato') === 'json') {
      const parse = (value) => {
        const found = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? '');
        return found ? new Date(Date.UTC(Number(found[3]), Number(found[2]) - 1, Number(found[1]))) : null;
      };
      const start = parse(url.searchParams.get('dataInicial'));
      const end = parse(url.searchParams.get('dataFinal'));
      if (!start || !end || end < start || (end.getTime() - start.getTime()) / 86400000 > 100) {
        return new globalThis.Response(null, { status: 422 });
      }
      const rows = [];
      for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
        if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) {
          const day = String(date.getUTCDate()).padStart(2, '0');
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          rows.push({ data: `${day}/${month}/${date.getUTCFullYear()}`, valor: match[1] === '12' ? '0.04' : '0.05' });
        }
      }
      return globalThis.Response.json(rows);
    }
    // Never allow an unexpected external provider to make the E2E suite
    // depend on live network/quotas. Local app requests remain untouched.
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return realFetch(input, init);
    return new globalThis.Response(null, { status: 503 });
  };
}

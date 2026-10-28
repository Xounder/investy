/**
 * B3's official 2026 equity-session announcement, published January 9, 2026:
 * https://www.b3.com.br/pt_br/noticias/calendario-de-negociacao-da-b3-confira-o-funcionamento-da-bolsa-em-2026.htm
 * Independently republished by B3 Bora Investir on the same day:
 * https://borainvestir.b3.com.br/noticias/calendario-de-negociacao-da-b3-confira-o-funcionamento-da-bolsa-em-2026/
 * Earlier year-specific samples (2021/2022):
 * https://www.b3.com.br/en_us/solutions/platforms/puma-trading-system/for-members-and-traders/trading-calendar/holidays/
 * Calendar is for equities, not banks, OTC settlement or US markets. Other years
 * fail closed outside independently cited samples.
 */
const publishedFixtures: Record<string, boolean> = {
  '2021-01-25': false, '2021-02-15': false, '2021-02-16': false,
  '2021-02-17': true, '2021-04-02': false, '2021-06-03': false,
  '2022-01-25': true, '2022-02-28': false, '2022-03-01': false,
  '2022-03-02': true, '2022-04-15': false, '2022-06-16': false,
};

/** B3 explicitly lists these as full days without an equity trading session. */
const fullClosures2026 = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03',
  '2026-04-21', '2026-05-01', '2026-06-04', '2026-09-07',
  '2026-10-12', '2026-11-02', '2026-11-20', '2026-12-24',
  '2026-12-25', '2026-12-31',
]);

/** Ash Wednesday is a trading session, not a full closure. Times are São Paulo local. */
export function specialEquitySession2026(date: string): { preOpen: string; tradingStart: string } | null {
  return date === '2026-02-18' ? { preOpen: '12:45', tradingStart: '13:00' } : null;
}

export function isTradingDay(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const day = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date ||
    day.getUTCDay() === 0 || day.getUTCDay() === 6) return false;
  if (Object.hasOwn(publishedFixtures, date)) return publishedFixtures[date]!;
  if (!date.startsWith('2026-')) return false;
  return !fullClosures2026.has(date);
}

import { describe, expect, it } from 'vitest';
import { isTradingDay, specialEquitySession2026 } from '../src/worker/b3-calendar.js';
import { dueJobs } from '../src/worker/scheduler.js';

/**
 * Independent fixture transcribed from B3's January 9, 2026 equity-session announcement:
 * https://www.b3.com.br/pt_br/noticias/calendario-de-negociacao-da-b3-confira-o-funcionamento-da-bolsa-em-2026.htm
 * B3 Bora Investir published the same list on January 9, 2026:
 * https://borainvestir.b3.com.br/noticias/calendario-de-negociacao-da-b3-confira-o-funcionamento-da-bolsa-em-2026/
 * Do not derive this fixture from the production calendar's closure set.
 */
const officialFullClosures = [
  '2026-01-01', // New Year's Day
  '2026-02-16', '2026-02-17', // Carnival (both sessions suspended)
  '2026-04-03', // Good Friday
  '2026-04-21', // Tiradentes
  '2026-05-01', // Labour Day
  '2026-06-04', // Corpus Christi
  '2026-09-07', // Independence Day
  '2026-10-12', // Our Lady of Aparecida
  '2026-11-02', // All Souls' Day
  '2026-11-20', // Black Consciousness Day
  '2026-12-24', // No equity session; OTC allocation can still occur
  '2026-12-25', // Christmas
  '2026-12-31', // No B3 equity session; banks may work internally
] as const;

describe('B3 2026 official equity-session calendar', () => {
  it('matches the entire published year, including all 14 full closures and all other weekdays', () => {
    const closed = new Set<string>(officialFullClosures);
    let weekdays = 0, sessions = 0;
    for (let ordinal = 0; ordinal < 365; ordinal++) {
      const instant = new Date(Date.UTC(2026, 0, 1 + ordinal, 12));
      const date = instant.toISOString().slice(0, 10);
      const weekday = instant.getUTCDay() !== 0 && instant.getUTCDay() !== 6;
      if (weekday) weekdays++;
      const published = weekday && !closed.has(date);
      if (published) sessions++;
      expect(isTradingDay(date), `B3 published equity session for ${date}`).toBe(published);
    }
    expect(weekdays).toBe(261);
    expect(closed.size).toBe(14);
    expect(sessions).toBe(247);
  });

  it('distinguishes the official Ash Wednesday afternoon session from pre-opening and Carnival closures', () => {
    expect(isTradingDay('2026-02-16')).toBe(false);
    expect(isTradingDay('2026-02-17')).toBe(false);
    expect(isTradingDay('2026-02-18')).toBe(true);
    expect(specialEquitySession2026('2026-02-18')).toEqual({ preOpen: '12:45', tradingStart: '13:00' });
    expect(specialEquitySession2026('2026-02-19')).toBeNull();
    expect(dueJobs(new Date('2026-02-18T15:45:00Z'))).not.toContain('quotes'); // 12:45 pre-open São Paulo
    expect(dueJobs(new Date('2026-02-18T16:00:00Z'))).toContain('quotes'); // 13:00 trading start
    expect(dueJobs(new Date('2026-02-17T21:00:00Z'))).not.toContain('snapshots');
  });

  it('trades normally on July 9 and does not conflate US or bank-only holidays with B3 closures', () => {
    for (const date of ['2026-07-09', '2026-07-03', '2026-01-19', '2026-11-26']) {
      expect(isTradingDay(date)).toBe(true);
    }
    expect(isTradingDay('2026-12-24')).toBe(false);
    expect(isTradingDay('2026-12-31')).toBe(false);
    expect(isTradingDay('2027-01-04')).toBe(false); // unsupported year fails closed
  });
});

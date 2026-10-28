/** Local cron schedules evaluated in the São Paulo civil time zone. */
import { isTradingDay, specialEquitySession2026 } from './b3-calendar.js';
export { isTradingDay } from './b3-calendar.js';
export const SCHEDULES = {
  quotes: '*/15 * * * 1-5',
  snapshots: '0 18 * * 1-5',
  dividends: '0 19 * * 1-5',
  backups: '0 2 * * *',
  backfill: '0 4 * * *',
  benchmarks: '0 20 * * *',
} as const;
export const CLOSE_QUOTE_REFRESH = '59 17 * * 1-5';

export function localTime(now: Date): { date: string; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(now);
  const field = (name: string) => parts.find((part) => part.type === name)?.value ?? '';
  return {
    date: `${field('year')}-${field('month')}-${field('day')}`,
    hour: Number(field('hour')), minute: Number(field('minute')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(field('weekday')),
  };
}

export function dueJobs(now: Date): Array<keyof typeof SCHEDULES> {
  const time = localTime(now);
  const jobs: Array<keyof typeof SCHEDULES> = [];
  if (time.hour === 2 && time.minute === 0) jobs.push('backups');
  if (time.hour === 4 && time.minute === 0) jobs.push('backfill');
  if (time.hour === 20 && time.minute === 0) jobs.push('benchmarks');
  if (!isTradingDay(time.date)) return jobs;
  // B3 starts Ash Wednesday trading at 13:00; 12:45 is pre-opening only.
  const special = specialEquitySession2026(time.date);
  const tradingStarted = !special || time.hour >= 13;
  // Warm quotes just before the internal 18:00 valuation cut-off, not an official B3 close.
  if (tradingStarted && ((time.minute % 15 === 0 && !(time.hour === 18 && time.minute === 0)) ||
    (time.hour === 17 && time.minute === 59))) jobs.push('quotes');
  if (time.hour === 18 && time.minute === 0) jobs.push('snapshots');
  if (time.hour === 19 && time.minute === 0) jobs.push('dividends');
  return jobs;
}

export function createScheduler(jobs: Partial<Record<keyof typeof SCHEDULES, () => Promise<unknown>>>,
  clock: () => Date = () => new Date(), log: Pick<Console, 'info' | 'error'> = console) {
  const active = new Map<string, Promise<void>>();
  const lastMinute = new Map<string, string>();
  let timer: ReturnType<typeof setInterval> | undefined;
  function tick(): void {
    const now = clock();
    const key = now.toISOString().slice(0, 16);
    for (const name of dueJobs(now)) {
      const run = jobs[name];
      if (!run || lastMinute.get(name) === key || active.has(name)) continue;
      lastMinute.set(name, key);
      const started = Date.now();
      log.info(JSON.stringify({ job: name, status: 'started', at: now.toISOString() }));
      const execution = Promise.resolve().then(run).then(
        () => log.info(JSON.stringify({ job: name, status: 'success', durationMs: Date.now() - started })),
        (error: unknown) => log.error(JSON.stringify({ job: name, status: 'failed',
          durationMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) })),
      ).then(() => { active.delete(name); });
      active.set(name, execution);
    }
  }
  return {
    start() { if (!timer) { tick(); timer = setInterval(tick, 30_000); } },
    async stop() { if (timer) clearInterval(timer); timer = undefined; await Promise.all(active.values()); },
    tick,
  };
}

export interface FiiProjection {
  assetId: string;
  nextExDate: string;
  cadence: 'monthly' | 'irregular';
  confidence: 'high' | 'low';
}

/** Only extrapolate when there are at least two observed ex-dates. */
export function projectFii(assetId: string, dates: Date[], today = new Date()): FiiProjection | null {
  const sorted = [...new Set(dates.map((date) => date.toISOString().slice(0, 10)))].sort();
  if (sorted.length < 2) return null;
  const gaps = sorted.slice(1).map((date, i) =>
    Math.round((Date.parse(date) - Date.parse(sorted[i]!)) / 86_400_000));
  const regular = gaps.every((gap) => gap >= 25 && gap <= 35);
  const last = new Date(`${sorted[sorted.length - 1]}T00:00:00.000Z`);
  const next = new Date(last);
  if (regular) {
    next.setUTCMonth(next.getUTCMonth() + 1);
    // Avoid Date.setUTCMonth overflow when the last ex-date is at month end.
    if (next.getUTCDate() !== last.getUTCDate()) next.setUTCDate(0);
    while (next <= today) next.setUTCMonth(next.getUTCMonth() + 1);
  } else {
    const interval = Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length);
    next.setUTCDate(next.getUTCDate() + Math.max(1, interval));
    while (next <= today) next.setUTCDate(next.getUTCDate() + Math.max(1, interval));
  }
  return { assetId, nextExDate: next.toISOString().slice(0, 10),
    cadence: regular ? 'monthly' : 'irregular', confidence: regular && gaps.length >= 2 ? 'high' : 'low' };
}

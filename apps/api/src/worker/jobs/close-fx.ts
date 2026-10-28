import type { QuoteTable } from '../../db/schema.js';
import { FX_TTL_MS } from '../../services/market-data/fx.js';
import { localTime } from '../scheduler.js';

/** Historical FX is a recorded, TTL-valid quote known at close; never fetch today's rate for a past close. */
export function asOfFx(quote: QuoteTable | undefined, close: Date): bigint | null {
  if (!quote || quote.isStale || quote.fxRateToBRL == null || quote.fxRateToBRL <= 0n ||
    quote.fetchedAt > close || quote.validUntil <= close ||
    close.getTime() - quote.fetchedAt.getTime() < 0 ||
    close.getTime() - quote.fetchedAt.getTime() > FX_TTL_MS ||
    // A prior-day quote is trustworthy only when it was actually persisted as
    // a weekly FX cache observation, not an intraday quote with an arbitrary expiry.
    (localTime(quote.fetchedAt).date !== localTime(close).date &&
      quote.validUntil.getTime() - quote.fetchedAt.getTime() < FX_TTL_MS)) return null;
  return quote.fxRateToBRL;
}

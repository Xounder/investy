/**
 * Shared zod validation helpers for TASK-05 routes (ADR-010).
 *
 * Every helper throws HTTPException(400) with the project error envelope
 * `{ error: { code, message, fields? } }` so all routes behave consistently.
 */
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

/** Builds a 400 HTTPException with the standard error envelope. */
export function badRequest(code: string, message: string, fields?: string[]): HTTPException {
  return new HTTPException(400, {
    res: Response.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status: 400 }),
  });
}

/** Parses and validates the JSON request body against a zod schema. */
export async function validateBody<S extends z.ZodTypeAny>(c: Context, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw badRequest('VALIDATION', 'Invalid JSON body');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw badRequest(
      'VALIDATION',
      'Invalid request body',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }
  return parsed.data;
}

/** Parses and validates the query string against a zod schema. */
export function validateQuery<S extends z.ZodTypeAny>(c: Context, schema: S): z.output<S> {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) {
    throw badRequest(
      'VALIDATION',
      'Invalid query parameters',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }
  return parsed.data;
}

/** UUID identifiers match the database primary/foreign key columns. */
export const uuidId = z.string().uuid();

/** Validates a UUID path parameter. */
export function validateIdParam(c: Context, name = 'id'): string {
  const value = c.req.param(name);
  if (!uuidId.safeParse(value).success) {
    throw badRequest('VALIDATION', `Invalid ${name} path parameter`);
  }
  return value!;
}

/** Calendar-valid ISO dates or timestamps with an explicit timezone. */
export const isoDateTime = z
  .string()
  .refine((v) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/.exec(v);
    if (!match) return false;
    const [, year, month, day, hours, minutes, seconds, zone] = match;
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    // Date.UTC treats years 0-99 as 1900-1999; compute leap years directly instead.
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    const maxDay = m === 2 ? (leap ? 29 : 28) : daysInMonth;
    if (y < 1 || m < 1 || m > 12 || d < 1 || d > maxDay) return false;
    if (hours !== undefined) {
      if (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59) return false;
      if (zone !== 'Z' && (Number(zone!.slice(1, 3)) > 23 || Number(zone!.slice(4)) > 59)) return false;
    }
    return !Number.isNaN(Date.parse(v));
  }, { message: 'Must be a valid ISO-8601 date' });

/** JSON integer or decimal string, bounded by PostgreSQL signed BIGINT. */
export const nonnegativeBigInt = z.union([
  z.number().int().safe().nonnegative(),
  z.string().regex(/^\d+$/),
]).transform((value, ctx) => {
  const parsed = BigInt(value);
  if (parsed > 9223372036854775807n) {
    ctx.addIssue({ code: 'custom', message: 'Must fit in a signed 64-bit integer' });
    return z.NEVER;
  }
  return parsed;
});

/** Positive-integer page number schema. */
export const pageSchema = z.coerce.number().int().positive().default(1);

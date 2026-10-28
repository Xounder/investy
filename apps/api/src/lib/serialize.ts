/**
 * JSON serialization helpers for TASK-05 routes.
 *
 * BigInt (integer cents, ADR-004) and Date values cannot be serialized by
 * JSON.stringify; every monetary amount is exposed as a decimal string and
 * timestamps as ISO-8601 UTC strings.
 */

/** Recursively converts bigint values to strings and Dates to ISO strings. */
export function serialize(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serialize);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serialize(v)]),
    );
  }
  return value;
}

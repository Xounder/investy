/** Bigint persistence uses micro percentage-points for SGS 12 and 1/10,000 index-point for indices. */
export const CDI_SCALE = 1_000_000;
export const INDEX_SCALE = 10_000;

export function scaledObservation(value: number, scale: number): bigint | null {
  if (!Number.isFinite(value) || value < 0 || value * scale > Number.MAX_SAFE_INTEGER) return null;
  // Provider JSON is numeric. Quantize to the declared precision once, not to money cents.
  return BigInt(Math.round(value * scale));
}

/** Tagged IDs preserve the existing endpoint's legacy row values while decoding new rows to native units. */
export function benchmarkValue(row: { id: string; value: bigint }): number {
  if (row.id.startsWith('sgs12-rate:')) return Number(row.value) / CDI_SCALE;
  if (row.id.startsWith('yahoo-index:')) return Number(row.value) / INDEX_SCALE;
  return Number(row.value);
}

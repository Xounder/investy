import { allocate } from '@investy/domain';

/** Domain allocator works on JS safe integers; reject values that would lose cents. */
export function allocateNotaFees(total: bigint, values: bigint[]): bigint[] {
  if (total < 0n || total > BigInt(Number.MAX_SAFE_INTEGER) ||
    values.some((v) => v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER)) ||
    values.reduce((a, b) => a + b, 0n) > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Valores da nota excedem o limite seguro para rateio');
  }
  const result = allocate(Number(total), values.map(Number)).map((a) => BigInt(a.allocatedFeeCents));
  if (result.reduce((a, b) => a + b, 0n) !== total) throw new Error('Rateio inconsistente');
  return result;
}

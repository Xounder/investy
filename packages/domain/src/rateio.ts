/**
 * Rateio de custos (proportional cost allocation) for B3 nota import.
 *
 * Operational costs (corretagem, liquidação, emolumentos, ISS, IRRF) are
 * allocated proportionally to each negócio. Fractional cents use the
 * largest-remainder (Hamilton) method so the sum of allocations equals the
 * declared total exactly (design-03).
 */

import type { RateioAllocation } from './types.js';

/**
 * Allocates `totalFeeCents` across `operations` proportionally, using the
 * largest-remainder (Hamilton) method.
 *
 * Guarantees:
 * - `sum(allocatedFeeCents) === totalFeeCents`
 * - Allocation is never negative
 * - Deterministic ordering on weight magnitude
 *
 * @param totalFeeCents - Total fee to allocate (integer cents).
 * @param operations    - Weight / value of each operation (proportional basis).
 * @returns Array of allocations indexed to match the input operations.
 */
export function allocate(totalFeeCents: number, operations: number[]): RateioAllocation[] {
  const count = operations.length;

  if (count === 0) {
    return [];
  }

  if (totalFeeCents <= 0) {
    return operations.map((_, operationIndex) => ({
      operationIndex,
      allocatedFeeCents: 0,
    }));
  }

  const totalWeight = operations.reduce((sum, weight) => sum + weight, 0);

  // Degenerate input: distribute equally, then spread the leftover cent-wise.
  if (totalWeight <= 0) {
    const base = Math.floor(totalFeeCents / count);
    let remainder = totalFeeCents - base * count;
    return operations.map((_, operationIndex) => {
      const allocatedFeeCents = remainder > 0 ? base + 1 : base;
      remainder -= 1;
      return { operationIndex, allocatedFeeCents };
    });
  }

  const exact = operations.map((weight) => (totalFeeCents * weight) / totalWeight);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = totalFeeCents - floors.reduce((sum, value) => sum + value, 0);

  // Order items by descending fractional part (ties resolved by index).
  const order = exact
    .map((value, index) => [index, value - Math.floor(value)] as const)
    .sort((a, b) => b[1] - a[1]);

  const result = [...floors];
  for (const [index] of order) {
    if (remainder <= 0) {
      break;
    }
    result[index] = (result[index] ?? 0) + 1;
    remainder -= 1;
  }

  return result.map((allocatedFeeCents, operationIndex) => ({
    operationIndex,
    allocatedFeeCents,
  }));
}

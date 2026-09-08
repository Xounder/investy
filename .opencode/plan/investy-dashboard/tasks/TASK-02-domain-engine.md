# Task Template

## Task Information

### ID

TASK-02

### Title

Domain Engine — JournalEngine, Money, FX, and Rateio (M1)

### Owner

senior-backend

### Status

Pending

---

## Description

Implement the core domain engine in `packages/domain` — the highest-risk, most-tested code in the system. This package contains zero external dependencies and pure TypeScript functions that implement the journal-first derivation model (ADR-005). Build the `JournalEngine` with all V1 transaction types: buy, sell, split/desdobramento, bonificação, JCP, amortização, adjustment, and opening. Implement integer-cent `Money` helpers (add, subtract, multiply, divide, compare, format). Implement `Fx` conversion helpers (USD quote → BRL using a provided fxRate). Implement the `Rateio` allocator (largest-remainder method for proportional cost distribution across nota operations). All functions must be property-tested: buy/sell round-trips reconcile, rateio sums equal declared total, money operations never produce floating-point drift, split preserves cost basis. Domain types: TransactionType, Holding, JournalEvent, MoneyCents, FxRate, RateioAllocation, AssetClass, DividendKind.

---

## Acceptance Criteria

- [ ] `JournalEngine.processTransaction(holding, event)` correctly derives new holding state for all 8 event types (buy, sell, split, bonificação, jcp, amortização, adjustment, opening)
- [ ] Buy: `qty += q; costBasis += q·price + feePortion; avg = costBasis / qty`
- [ ] Sell: average-cost realized P&L computed as `(unitPrice − avg)·q − feePortion`; qty/costBasis reduced
- [ ] Split: `qty = qty × factor`; cost basis unchanged
- [ ] Bonificação: quantity increase; avg adjusts
- [ ] JCP/Rendimento: no qty change; income recorded per unit
- [ ] Amortização: qty × rate cash inflow; cost basis reduced (floored at 0)
- [ ] Adjustment/Opening: seeds state with qty + avg price
- [ ] `Money` helpers: add, subtract, multiply, divide (integer), compare, format with `Intl.NumberFormat('pt-BR')`
- [ ] `Fx.convertToBRL(priceCentsUSD, fxRate)` returns correct BRL cents
- [ ] `Rateio.allocate(totalFeeCents, operations[])` distributes fees proportionally; sum of allocations equals total exactly (largest-remainder)
- [ ] Property tests: buy→sell round-trip reconciles; rateio sum = total; split preserves cost basis; money operations never drift
- [ ] All unit tests pass via Vitest
- [ ] `packages/domain` builds with zero errors and zero external dependencies

---

## Dependencies

### Required Tasks

- TASK-01

### Dependency Notes

Depends on the monorepo skeleton and domain package structure from TASK-01. The domain package must be wired for build and test.

---

## Technical Context

### Relevant Components

- `packages/domain/src/journal-engine.ts`
- `packages/domain/src/money.ts`
- `packages/domain/src/fx.ts`
- `packages/domain/src/rateio.ts`
- `packages/domain/src/types.ts`

### Relevant Modules

- Journal-first derivation (ADR-005)
- Integer-cent money (ADR-004)
- FX strategy (design-03)
- Rateio de custos (design-03)

### Relevant APIs

- None (pure domain logic, no API layer)

### Relevant Types

- `TransactionType` (buy/sell/split/bonificação/jcp/amortização/adjustment/opening)
- `Holding` (qty, avgPriceCents, costBasisCents, realizedPnlCents)
- `JournalEvent` (type, date, qty, unitPriceCents, feeCents, factor?, rate?)
- `MoneyCents` (brand type: bigint)
- `FxRate` (rate: number, fetchedAt: Date)
- `RateioAllocation` (operationIndex, allocatedFeeCents)
- `AssetClass` (acao/fii/etf/etf_us/etf_ie/bdr/crypto/rf/tesouro/indice)
- `DividendKind` (dividend/jcp/rendimento/amortizacao)

---

## Implementation Guidance

### Expected Changes

- Implement `packages/domain/src/types.ts` with all domain types
- Implement `packages/domain/src/money.ts` with integer-cent Money helpers
- Implement `packages/domain/src/fx.ts` with USD→BRL conversion
- Implement `packages/domain/src/rateio.ts` with largest-remainder allocator
- Implement `packages/domain/src/journal-engine.ts` with processTransaction and all 8 event types
- Write comprehensive unit tests in `packages/domain/src/__tests__/`
- Write property-based tests for invariants (reconciliation, rateio sum, cost basis preservation)

### Constraints

- ZERO external dependencies in `packages/domain` (ADR-002)
- All money in integer cents (BIGINT) — no floating-point for BRL arithmetic (ADR-004)
- Average-cost method for realized P&L (display only, no tax computation) (design-03)
- Amortização reduces cost basis, floored at 0 (design-03)
- Rateio uses largest-remainder method; sum of allocated fees must equal declared total exactly (design-03)
- Fx conversion at read/valuation time only, not persisted (design-03)

### Validation Rules

- `packages/domain` builds with zero errors
- All Vitest tests pass
- No floating-point money operations (integer cents only)
- Rateio allocations sum to declared total (±0 cents)
- Buy→sell round-trip: realized P&L = (sellPrice − avgBuyPrice) × qty − totalFees

---

## Edge Cases

- Sell entire position (qty goes to 0) — cost basis must reset to 0
- Sell more than held — must reject (engine returns error, not negative qty)
- Split factor = 1 (no-op) — must be a valid event, not an error
- Amortização when cost basis is already 0 — must floor at 0, not go negative
- Buy with zero fees — cost basis = qty × price only
- Buy with zero qty — must reject
- Division by zero in avg price (qty = 0 after sell) — handle gracefully (avg = 0 or undefined)
- Opening event with negative qty — must reject
- Rateio with single operation — entire fee goes to that operation
- Rateio with zero total value — must handle division by zero gracefully
- FxRate of 0 or negative — must reject
- Money overflow (very large positions × high price) — use BigInt to prevent

---

## Testing

### Unit Tests

- [ ] JournalEngine: buy event derives correct holding
- [ ] JournalEngine: sell event computes realized P&L correctly
- [ ] JournalEngine: sell entire position (qty → 0)
- [ ] JournalEngine: split event multiplies qty, preserves cost basis
- [ ] JournalEngine: bonificação event increases qty
- [ ] JournalEngine: JCP event records income, no qty change
- [ ] JournalEngine: amortização reduces cost basis (floored at 0)
- [ ] JournalEngine: adjustment/opening seeds state
- [ ] JournalEngine: rejects invalid events (negative qty, sell > held)
- [ ] Money: add, subtract, multiply, divide, compare
- [ ] Money: pt-BR formatting
- [ ] Fx: USD→BRL conversion
- [ ] Fx: rejects invalid rates
- [ ] Rateio: proportional allocation with largest-remainder
- [ ] Rateio: single operation gets full fee
- [ ] Rateio: sum of allocations equals total

### Integration Tests

- [ ] Property test: buy→sell round-trip reconciliation
- [ ] Property test: rateio sum = declared total
- [ ] Property test: split preserves cost basis
- [ ] Property test: money operations never produce floating-point artifacts

### Manual Validation

- [ ] Run `pnpm test` in `packages/domain` — all tests pass
- [ ] Run `pnpm build` in `packages/domain` — builds cleanly
- [ ] Verify no external dependencies in package.json

---

## Definition of Done

- [ ] Implementation completed
- [ ] Acceptance criteria satisfied
- [ ] Tests created or updated
- [ ] Build passes
- [ ] Lint passes
- [ ] Validation completed

---

## References

- ADR-004: Integer-cent money
- ADR-005: Transaction journal source of truth
- design-03: Domain/data model, derivation rules, FX strategy, rateio
- design-07: M1 Domain engine milestone (4 dev-days)

# Design 03 — Domain and Data Model

## Context

### Problem Statement

Investy's core invariant is that every position is derived from the transaction journal and reconciles exactly with it (ADR-005). The domain model must cover multi-user ownership, broker/account/portfolio scopes, the global asset catalog, quote cache with manual override, user-scoped dividend tracking with statuses, daily snapshots, benchmark series, and an FX strategy for foreign assets. Money must never suffer floating-point drift (ADR-004).

### Goals

- Define canonical entities with ownership model.
- Specify journal → holdings derivation rules (buy, sell, split/desdobramento, bonificação, JCP, amortização, adjustment, opening).
- Define integer-cent money handling and the valuation pipeline, including the confirmed FX strategy (USD quote + FX → BRL on read; BDRs via brapi directly).
- Specify rateio de custos (proportional cost allocation) applied on nota import.
- Give backend/domain agents a precise calculation contract with test vectors.

### Constraints

- ADR-004: managed Postgres + Drizzle; BIGINT integer cents; UTC storage; America/Sao_Paulo at presentation.
- ADR-005: journal is source of truth; holdings materialized for reads, recomputed transactionally on write.
- ADR-003: provider-agnostic quote proxy; cache TTL; manual override wins until cleared.
- ADR-007: worker persists daily snapshots and benchmark series; idempotent jobs; no snapshot pruning (user-confirmed).
- ADR-006: every user-owned row carries owner scope enforced at repository layer.
- User-confirmed: multi-portfolio day one; FII cadence projection; USD quote + FX for US/IE ETFs and crypto.

---

## Options Considered

### Option A — Holdings-first storage (positions edited directly)

#### Description

Store a positions table as editable state; journal is optional metadata.

#### Advantages

- Simple schema; easy CRUD.

#### Disadvantages

- Violates ADR-005; unrealizable reconciliation; no audit trail; import/export not lossless.

#### Effort Estimate

Small — rejected (ADR-005).

### Option B — Event-sourced intermediate (per-transaction immutable ledger with versioned state projection)

#### Description

Every journal event is immutable; a projection (materialized holding) is rebuilt per account+asset on write.

#### Advantages

- Reproducible state; clean derivation; strong audit.

#### Disadvantages

- Rebuild cost on large histories; needs careful transactional invalidation.

#### Effort Estimate

Medium — selected as the guiding model (aligned with ADR-005).

### Custom Option (Selected) — Journal-first with materialized holdings and the user-confirmed expansions

#### Description

The settled model below (entities + derivation rules + FX + rateio), including multi-portfolio, FII projection inputs, and amortização as a first-class event.

#### Notes

- Fully reconciled with ADR-004/005 and the approved presentation's §3.

---

## Decision

### Selected Option

Custom Option B (journal-first with materialized holdings) as presented and approved.

### Reasoning

- Only option honoring ADR-005's "no position state outside the journal".
- Rateio de custos, amortização, splits/bonificações and FX integrate naturally into event semantics.

### Trade-offs Accepted

- Every journal write triggers holding recompute → wrapped in one DB transaction.
- Splits/bonificações must be recognized from provider events and from nota parsing (factor applied to qty, cost basis preserved).

---

## Entities

| Entity | Scope | Key fields | Notes |
|---|---|---|---|
| `User` | global | email, passwordHash (Argon2id), session refs | ADR-006 |
| `Portfolio` | user | name, isDefault, currency=BRL | Multi-portfolio UI day one |
| `Broker` | global catalog | name, code, url | Seeded set + extensible |
| `Account` | user | portfolioId, brokerId, name, accountNumber | Where assets are held |
| `Asset` | global catalog | symbol, name, class, sector, currency, providerKey, isin | Classes: acao/fii/etf/etf_us/etf_ie/bdr/crypto/rf/tesouro/indice |
| `Transaction` | user | portfolioId, accountId, assetId, type, date, qty, unitPriceCents, feeCents, realizedPnlCents*, source, notaRefId, createdAt | *on sells only, average-cost, display only |
| `Dividend` | user | assetId, kind (dividend/jcp/rendimento/amortizacao), exDate, paymentDate, rateCentsPerUnit, status (expected/confirmed/paid), source (provider/manual) | Provider gives ex-date reliably; paymentDate is competence ref → user confirms |
| `Quote` | global cache | assetId, priceCents, currency, fxRateToBRL, source, fetchedAt, validUntil | TTL cache; no owner |
| `QuoteOverride` | user | assetId, priceCents, currency, createdAt | Wins until cleared |
| `Holding` | user (derived) | accountId, assetId, qty, avgPriceCents, costBasisCents, realizedPnlCents, updatedAt | Materialized, read-only |
| `PortfolioSnapshot` | user | portfolioId, date, totalValueCents, costBasisCents, allocationJsonb (byClass/bySector) | Retained indefinitely (no pruning) |
| `BenchmarkSeries` | global | symbol (CDI/Selic/IPCA/IBOV/IFIX/SPX), date, value | Worker-maintained |
| `NotaImport` | user | brokerId, notaNumber, tradeDate, jsonb payload (parsed rows + fees), status (pending/confirmed), importHash | Dedupe by broker+number+tradeDate |

## Journal → Holdings Derivation Rules

Applied per account × asset, ordered by transaction date then createdAt:

- **Buy**: `qty += q`; `costBasis += q·price + feePortion`; `avg = costBasis / qty`.
- **Sell**: average-cost — `realized = (unitPrice − avg)·q − feePortion`; stored on the sale row (display only); `qty −= q`; `costBasis −= q·avg`.
- **Split/desdobramento**: `qty = qty × factor`; cost basis unchanged (avg adjusts implicitly); a journal event so history reconciles.
- **Bonificação**: quantity increase without cash; recorded as event with `factor`; avg adjusts.
- **Dividend / JCP / Rendimento**: no qty change; income recorded per unit; JCP keeps retained 15% note for future reference (no tax computation in V1).
- **Amortização**: FII/capital return — qty × rate cash inflow, reduces cost basis (`costBasis −= q·amortRate`, floored at 0). Distinct from RENDIMENTO by label (brapi `/fiis/dividends` semantics).
- **Adjustment / opening**: seeds state (manual holding entry or historical nota backfill); an `opening` event with qty + avg price so subsequent math is consistent.

All money fields are integer cents (BIGINT). Derived percentages (returns, allocation) are computed as numbers at display time only, never persisted (ADR-004). A helper in `packages/domain` rounds per-operation fee allocation to cents and carries the residual to keep the journal total exactly reconcilable.

## Valuation Pipeline and FX Strategy

1. **Provider routing** (ADR-003 proxy): B3 assets → brapi.dev; US/IE ETFs → Yahoo chart (USD quote); crypto → CoinGecko (USD fallback) or brapi; macro → BCB SGS; indicators → brapi.
2. **Cache**: `Quote` rows with TTL (intraday refresh window); stale-but-valid fallback (last-known-good flagged); `QuoteOverride` rows win until cleared.
3. **FX (user-confirmed)**: foreign assets are quoted in native currency (USD) and converted to BRL on read using a weekly FX quote row sourced from brapi USDBRL (BCB fallback). `(priceCentsUSD × qty × fx)` computed at read/valuation time into cents. BDRs are quoted directly by brapi in BRL — no FX step.
4. **Portfolio totals**: sum of `marketValue = qty × priceBRL` per holding; cost basis from journal; unrealized = marketValue − costBasis; realized accumulated per portfolio.
5. **Snapshots** (ADR-007): worker persists daily `PortfolioSnapshot` (total, cost, allocation jsonb) at market close in America/Sao_Paulo boundaries; read at presentation in local/BR timezone.

## Rateio de Custos (nota import)

On a B3 nota (Sinacor layout), operational costs (corretagem, taxa de liquidação, emolumentos, ISS, IRRF) are allocated proportionally to each negócio by `operationValue / totalNegotiatedValue`; fractional cents use a largest-remainder method so the sum of allocated fees equals the nota's declared total exactly. Cut costs are attached to buy premiums / sell executed-price adjustments for realized-P&L math. Day-trade (`D`) flag is captured for informational purposes; no tax computation (user-confirmed).

---

## Impact

### Documentation Affected

- `design-04-rest-api-contract.md` (entities exposed over REST)
- `design-06-import-export-data-ownership.md` (rateio + nota lifecycle)
- `design-07-effort-sequence-estimate.md` (domain engine effort)

### Architecture Affected

- ADR-004, ADR-005, ADR-003, ADR-007 consumed.
- Future: `docs/backend/` schema docs, `docs/feature/` workflows.

### Dependencies Added

- Drizzle schema, zod validation at boundaries, pure-TS `packages/domain` (JournalEngine, Money, Fx, Rateio).

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Float drift in fee rateio | Low (cents math) | High | Integer math + largest-remainder; property tests assert sum(fees)=total |
| FX rate staleness misprices portfolio | Medium | Medium | TTL on FX quotes; stale flag surfaced in indicator strip |
| Split/bonificação missed in import | Medium | Medium | Provider corporate-event fetch + reconciliation warnings in preview |
| Amortização double-counting as income | Medium | Medium | Distinct event type + UI labeling (return of capital, not income) |

---

## Open Questions

- Amortização treatment finalized: reduce cost basis (selected). Flag if a "withdraw capital in kind" variant is needed in V2.
# Task Template

## Task Information

### ID

TASK-04

### Title

Market Data Proxy and Asset Catalog (M3)

### Owner

senior-backend

### Status

Pending

---

## Description

Implement the server-side market data proxy (ADR-003) with a provider-agnostic `QuoteProvider` interface, supporting brapi.dev (B3/FII/ETF/BDR/crypto + indicators), BCB SGS (Selic/CDI/IPCA), Yahoo Finance chart (US/IE ETFs), and CoinGecko (crypto fallback). Build a TTL-based quote cache in Postgres, manual price override mechanism, and FX quote row management (USDBRL from brapi, BCB fallback). Implement the asset catalog: seed data, search, trending ("mais buscados"), asset detail with last quote and overrides. All quote endpoints return BRL values with FX conversion applied at read time for foreign assets. BDRs are quoted directly in BRL by brapi (no FX step).

---

## Acceptance Criteria

- [ ] `QuoteProvider` interface: `fetchQuote(symbol, assetClass)` returns `{ priceCents, currency, source }` or null
- [ ] brapi.dev provider: fetches B3 stocks, FIIs, ETFs (nacionais), BDRs, crypto, indicators
- [ ] BCB SGS provider: fetches Selic, CDI, IPCA daily values
- [ ] Yahoo Finance provider: fetches US/IE ETF quotes in USD
- [ ] CoinGecko provider: fetches crypto prices in USD (fallback)
- [ ] Quote cache: stores `Quote` rows with TTL; stale-but-valid fallback (last-known-good)
- [ ] Quote override: `QuoteOverride` rows win until cleared by user
- [ ] FX quote row: USDBRL rate cached from brapi or BCB; used for USD→BRL conversion at read time
- [ ] `GET /market/quotes?symbols=A,B,C` — returns `{ quotes[], stale[], overrides[] }` with TTL-cached data
- [ ] `GET /market/benchmarks?series=CDI,IBOV` — returns benchmark time series
- [ ] `GET /market/indicators` — returns latest Selic/CDI/IPCA with fetch time
- [ ] `GET /assets?search=&class=&currency=&page=` — paged catalog search
- [ ] `GET /assets/trending` — top searched assets
- [ ] `GET /assets/:symbol` — catalog entity + last quote + user overrides
- [ ] `PATCH /assets/:symbol/override` — create/update user price override
- [ ] `DELETE /assets/:symbol/override` — clear user override
- [ ] Asset catalog seeded with common Brazilian assets (top ações, FIIs, ETFs, BDRs)
- [ ] All tests pass; build/typecheck/lint clean

---

## Dependencies

### Required Tasks

- TASK-01
- TASK-02
- TASK-03

### Dependency Notes

Requires TASK-01 for monorepo structure, TASK-02 for domain types (MoneyCents, AssetClass, FxRate), and TASK-03 for database schema (Quote, QuoteOverride, Asset tables) and auth middleware.

---

## Technical Context

### Relevant Components

- `apps/api/src/services/market-data/` — provider implementations
- `apps/api/src/services/market-data/quote-provider.ts` — provider interface
- `apps/api/src/services/market-data/cache.ts` — TTL cache logic
- `apps/api/src/services/market-data/fx.ts` — FX quote management
- `apps/api/src/services/market-data/overrides.ts` — manual override logic
- `apps/api/src/routes/market.ts` — market data endpoints
- `apps/api/src/routes/assets.ts` — asset catalog endpoints
- `apps/api/src/db/schema.ts` — Quote, QuoteOverride, Asset, BenchmarkSeries tables

### Relevant Modules

- Market data proxy (ADR-003)
- Assets Catalog module (M7 in design-01)
- FX strategy (design-03)

### Relevant APIs

- `GET /market/quotes`
- `GET /market/benchmarks`
- `GET /market/indicators`
- `GET /assets`
- `GET /assets/trending`
- `GET /assets/:symbol`
- `PATCH /assets/:symbol/override`
- `DELETE /assets/:symbol/override`

### Relevant Types

- `QuoteProvider` interface
- `Quote` (assetId, priceCents, currency, fxRateToBRL, source, fetchedAt, validUntil)
- `QuoteOverride` (userId, assetId, priceCents, currency, createdAt)
- `Asset` (symbol, name, class, sector, currency, providerKey, isin)
- `BenchmarkSeries` (symbol, date, value)
- `FxRate` (rate, fetchedAt)

---

## Implementation Guidance

### Expected Changes

- Implement `QuoteProvider` interface and concrete providers (brapi, BCB, Yahoo, CoinGecko)
- Implement quote cache with TTL in Postgres (`Quote` table)
- Implement FX quote row management (USDBRL)
- Implement override logic (`QuoteOverride` table)
- Implement `GET /market/quotes` with lazy hydration and stale fallback
- Implement `GET /market/benchmarks` and `GET /market/indicators`
- Implement asset catalog CRUD and search
- Seed asset catalog with common Brazilian assets
- Implement trending ("mais buscados") based on search frequency or curated list

### Constraints

- Provider-agnostic interface (ADR-003) — no domain logic depends on a specific vendor
- Cache TTL: intraday refresh window; stale-but-valid fallback (ADR-003)
- Manual override wins until cleared (ADR-003)
- BDRs quoted directly in BRL by brapi — no FX conversion step
- US/IE ETFs quoted in USD, converted to BRL on read using cached FX rate
- CoinGecko as fallback for crypto (brapi primary)
- BCB SGS as official macro data source (Selic/CDI/IPCA)
- zod validation on all query parameters
- Rate limiting on provider API calls (quota budgeting)

### Validation Rules

- Quote cache respects TTL; stale quotes flagged but still served
- Override wins over cached quote until explicitly cleared
- FX conversion: `priceCentsUSD × qty × fxRate` computed at read time, not persisted
- Asset search is case-insensitive and supports partial matches
- Trending returns a reasonable default list (curated or frequency-based)

---

## Edge Cases

- Provider API down (brapi, BCB, Yahoo, CoinGecko) — serve stale cache; flag as stale in response
- FX rate unavailable — foreign assets flagged as "FX unavailable"; BRL value not computed
- Quote for unknown symbol — return null gracefully, not 500
- Cache TTL expired but provider unreachable — serve stale with stale flag
- Multiple providers for same symbol — use primary (brapi for B3, Yahoo for US); fallback chain
- Rate limit exceeded on provider API — degrade to cache; log warning
- Very large symbol list in batch query — paginate or cap (max 50 symbols per request)
- Asset catalog seed idempotency — upsert on re-run
- Override for asset not in catalog — reject with 400
- Concurrent override updates — last write wins (no optimistic locking needed)

---

## File Overlap Warning

The following files are also modified by other tasks. Merge strategy applies:

- `apps/api/src/db/schema.ts` — also TASK-03 (creates schema), TASK-05 (route reads), TASK-10 (worker reads). **Merge strategy: sequential** — TASK-03 created the schema; this task ADDS Quote/QuoteOverride/Asset/BenchmarkSeries tables only. Do not modify tables defined by TASK-03.
- `apps/api/src/index.ts` — also TASK-03, TASK-05, TASK-13 (each registers its own route module). **Merge strategy: sequential preferred**; if parallelized, merge at the route-registration block only.

---

## Testing

### Unit Tests

- [ ] QuoteProvider interface contract (mock providers)
- [ ] Cache TTL logic: fresh, stale, expired
- [ ] FX conversion: USD→BRL with valid rate
- [ ] FX conversion: unavailable rate returns error
- [ ] Override wins over cached quote
- [ ] Override cleared restores cached quote
- [ ] Asset search: partial match, case-insensitive
- [ ] Rate limiter: blocks after threshold

### Integration Tests

- [ ] Market quotes endpoint returns cached data
- [ ] Market quotes endpoint flags stale data
- [ ] Asset catalog CRUD (create, search, detail)
- [ ] Override create → update → clear lifecycle
- [ ] Benchmark series endpoint returns data
- [ ] Indicators endpoint returns latest values

### Manual Validation

- [ ] `pnpm build` in `apps/api` passes
- [ ] `pnpm test` in `apps/api` passes
- [ ] Manual test: `GET /market/quotes?symbols=PETR4,VALE3` returns quotes
- [ ] Manual test: `GET /assets?search=petro` returns Petrobras

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

- ADR-003: Market data proxy
- ADR-004: Postgres (Quote tables)
- design-03: FX strategy, quote cache
- design-04: Market data endpoints
- design-07: M3 Market proxy + catalog milestone (4 dev-days)

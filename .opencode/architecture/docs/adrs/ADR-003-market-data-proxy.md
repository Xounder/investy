# ADR-003: Server-Side Market-Data Proxy with Provider Cache

**Status:** Accepted  
**Date:** 2026-09-04

## Context

Investy needs live and historical prices plus macro benchmarks (Selic, CDI, IPCA, IBOV, IFIX, S&P 500). Free public data sources are fragmented:

- **brapi.dev** — B3 universe (ações, FIIs, ETFs, BDRs), crypto, indicators; free tier ~15k requests/month; ~99.9% uptime but occasional short outages.
- **BCB SGS** — official Selic/CDI/IPCA series; free, keyless, no CORS restrictions server-side.
- **Yahoo Finance chart API** — US/IE ETF history; unofficial, non-contracted, can break or rate-limit silently.
- **CoinGecko** — crypto fallback; generous free tier.
- Direct browser calls expose API keys, hit CORS walls, and reset caches on every visit.

## Decision

Consume market data exclusively **server-side** through a provider interface in `apps/api`:

1. **Pluggable provider interface** — a `QuoteProvider` contract (latest quote, historical series, macro series) with implementations for brapi.dev (primary for B3 + crypto + indicators), BCB SGS (macro), Yahoo Finance chart (US/IE ETF history), and CoinGecko (crypto fallback).
2. **Persistent quote cache** — quotes are stored in Postgres with a TTL (intraday refresh window and daily close). The API serves cached values within TTL and refreshes from providers behind the scenes, so the UI never waits on a provider or exhausts quotas.
3. **Graceful degradation** — last-known-good values are served while a provider is down; the user can **manually override** any price, and the manual override wins until cleared.
4. **Provider keys live in server env vars only** — never shipped to the browser.
5. **Rate-limit budgeting** — the proxy throttles provider calls and coalesces duplicate symbol requests.

## Consequences

### Pros

- Secrets are never exposed; CORS concerns are eliminated at the source.
- Quota usage is bounded and predictable; caching makes the free brapi tier largely sufficient for personal scale.
- Provider outages degrade to stale-but-valid data instead of broken UI.
- Swapping or adding providers later does not touch UI or domain logic.

### Cons

- Requires a backend component (part of the approved Option C architecture).
- Yahoo finance data is third-party and undocumented; must be treated as best-effort with manual-override fallback.
- Provider contracts drift; keeping adapters in sync is ongoing maintenance.

## Alternatives Considered

- **Direct browser to public APIs**: rejected — key exposure, CORS, per-visit quota burn, no offline/history.
- **Fully manual price entry only**: rejected — fails the live-quote core requirement.
- **Single provider only (brapi.dev)**: rejected — does not cover US/IE ETF history reliably and couples the product to one vendor.
- **Third-party aggregator gateway (paid)**: rejected for V1 — unnecessary cost at personal scale.
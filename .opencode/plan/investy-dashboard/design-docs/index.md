# Investy — Design Documents Index

Pipeline: `investy-dashboard` · Status: approved · Phase: design documents created (Phase 2).

## Overview

These design documents translate the approved architecture base (ADR-001..010) and the user-confirmed decisions from the Solution Designer presentation into the V1 solution design for Investy — a multi-user Brazilian investment portfolio dashboard with a journal-first data model, full-scope B3 nota import, FX-aware valuation, and a DocuForge-based data-dense dashboard UI.

## Confirmed Decisions Summary

| # | Decision | Choice |
|---|---|---|
| D1 | Product scope | Nine-module V1 (all success criteria); non-goals per architecture.md honored |
| D2 | IA/UX | Option C — module-first, drawer-amplified (global "+ Registrar", inline holdings actions, deep-link widgets, tabular numerals) |
| D3 | Domain/data model | Journal-first with materialized holdings; integer cents; average-cost realized P&L (display only); USD quote + FX→BRL; amortização as capital-return event; rateio de custos on nota |
| D4 | REST API | Resource-oriented REST with focused aggregates; nota preview→confirm; ownership-scoped; zod + rate limits |
| D5 | Design system | DocuForge tokens → dashboard composites (KPI, tables, chips, strips) + Recharts theme; light theme; responsive |
| D6 | Import/export & ownership | Lossless journal round-trip (JSON/CSV), full nota scope, automated verified backups, account erasure, retain all snapshots |
| D7 | Effort/sequence | ≈40 dev-days; foundation → journal engine → auth → market → modules → dashboard/reports; parallel tracks after M3 |

## Design Decision List

| Doc | Decision | Status |
|---|---|---|
| [design-01-product-scope.md](design-01-product-scope.md) | V1 module boundaries, V1 vs V2 vs non-goals | Approved |
| [design-02-information-architecture-ux.md](design-02-information-architecture-ux.md) | IA/UX Option C, screen map, journeys | Approved |
| [design-03-domain-data-model.md](design-03-domain-data-model.md) | Entities, derivation rules, money, FX, rateio, amortização | Approved |
| [design-04-rest-api-contract.md](design-04-rest-api-contract.md) | Endpoint table (v1) + cross-cutting behavior | Approved |
| [design-05-design-system-application.md](design-05-design-system-application.md) | Token mapping, component grammar, Recharts theme, states | Approved |
| [design-06-import-export-data-ownership.md](design-06-import-export-data-ownership.md) | Input channels, export formats, backups, erasure, retention | Approved |
| [design-07-effort-sequence-estimate.md](design-07-effort-sequence-estimate.md) | Milestones M0..M9, parallelization, ≈40 dev-days | Approved |

## Reference Mapping

| Topic | Source |
|---|---|
| Full-stack Option C | [architecture.md](../architecture/architecture.md) · ADR-001 |
| Monorepo layout | ADR-002 |
| Market-data proxy | ADR-003 |
| Postgres + integer cents | ADR-004 |
| Transaction journal + nota V1 | ADR-005 |
| Auth + multi-user isolation | ADR-006 |
| Scheduled worker | ADR-007 |
| Hosting/deployment | ADR-008 |
| Design system frontend | ADR-009 |
| Security foundation | ADR-010 |
| Architecture entry | [architecture/index.md](../architecture/index.md) |
| Next phase | Tech Lead — decomposition from design-01/03/04 into tasks |

## Open Items for Implementation

- Managed Postgres provider (Neon/Supabase/Railway) and API host (Railway/Fly/Render) — finalized at implementation (architecture.md Open Questions).
- Pagination strategy (offset vs keyset) — backend agent during implementation (design-04).
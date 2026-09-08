/**
 * @investy/domain — Investy shared domain package.
 *
 * Pure TypeScript with zero external dependencies (ADR-002). Contains:
 *   - types: domain types (TransactionType, Holding, JournalEvent, etc.)
 *   - journal-engine: transaction journal engine (ADR-005)
 *   - money: integer-cent money helpers (ADR-004)
 *   - fx: FX rate types and conversion helpers
 *   - rateio: proportional cost allocation (largest-remainder)
 */
export * from './types.js';
export * from './money.js';
export * from './fx.js';
export * from './rateio.js';
export * from './journal-engine.js';

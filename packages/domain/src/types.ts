/**
 * Domain types for the Investy portfolio system.
 *
 * Pure TypeScript type definitions with zero runtime code.
 * All monetary values use bigint (integer cents, ADR-004).
 */

// ---------------------------------------------------------------------------
// Transaction types
// ---------------------------------------------------------------------------

/** Journal event types supported in V1. */
export type TransactionType =
  | 'buy'
  | 'sell'
  | 'split'
  | 'bonificacao'
  | 'dividend'
  | 'jcp'
  | 'amortizacao'
  | 'adjustment'
  | 'opening';

/** Classification of dividend/income events (used at higher layers). */
export type DividendKind = 'dividend' | 'jcp' | 'rendimento' | 'amortizacao';

// ---------------------------------------------------------------------------
// Asset classification
// ---------------------------------------------------------------------------

/** Asset classes recognised by the Investy system. */
export type AssetClass =
  | 'acao'
  | 'fii'
  | 'etf'
  | 'etf_us'
  | 'etf_ie'
  | 'bdr'
  | 'crypto'
  | 'rf'
  | 'tesouro'
  | 'indice';

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** A monetary amount expressed in integer cents (bigint, ADR-004). */
export type MoneyCents = bigint;

// ---------------------------------------------------------------------------
// Holding / position state
// ---------------------------------------------------------------------------

/** Derived position state for a single ticker, computed from the journal. */
export interface Holding {
  /** Number of shares/units held (always >= 0). */
  readonly qty: bigint;
  /** Weighted-average cost per share in cents (display only). */
  readonly avgPriceCents: bigint;
  /** Total cost basis in cents (authoritative source of truth). */
  readonly costBasisCents: bigint;
  /** Cumulative realised P&L in cents (can be negative). */
  readonly realizedPnlCents: bigint;
}

// ---------------------------------------------------------------------------
// Journal events
// ---------------------------------------------------------------------------

/** A single journal event fed into the derivation engine. */
export interface JournalEvent {
  readonly type: TransactionType;
  /** ISO 8601 UTC date string. */
  readonly date: string;
  /** Quantity of shares/units (buy/sell/bonificacao) or 0 for income events. */
  readonly qty: bigint;
  /** Price per unit in cents (buy/sell/dividend/jcp) or 0 for events that don't use it. */
  readonly unitPriceCents: bigint;
  /** Transaction fee in cents (buy/sell); 0 for corporate events. */
  readonly feeCents: bigint;
  /** Rounded total dividend/JCP income in BRL cents, after applying historical FX once. */
  readonly dividendIncomeCents?: bigint;
  /** Rounded total capital return in BRL cents, before reducing the position basis. */
  readonly amortizationCents?: bigint;
  /** Split ratio — positive integer (e.g. 2 for 2:1). Only used by 'split'. */
  readonly factor?: number;
  /** Amortisation rate in cents per share. Only used by 'amortizacao'. */
  readonly rate?: number;
}

// ---------------------------------------------------------------------------
// FX
// ---------------------------------------------------------------------------

/** An exchange-rate quote: 1 unit of base currency equals `rate` units of quote. */
export interface FxRate {
  /** The exchange rate (e.g. 5.20 for USD→BRL). */
  readonly rate: number;
  /** Timestamp of when the rate was fetched. */
  readonly fetchedAt: Date;
}

// ---------------------------------------------------------------------------
// Rateio (cost allocation)
// ---------------------------------------------------------------------------

/** One bucket of a proportional fee allocation result. */
export interface RateioAllocation {
  /** Index of the operation this allocation belongs to. */
  readonly operationIndex: number;
  /** Allocated fee amount in integer cents. */
  readonly allocatedFeeCents: number;
}

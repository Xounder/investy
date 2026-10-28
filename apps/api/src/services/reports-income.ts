import type { AssetRow, DividendRow, TransactionRow } from '../repositories/reports.js';
import { toBRL } from './journal-money.js';

type Totals = { income: bigint; amortization: bigint; realizedSalePnl: bigint };
const empty = (): Totals => ({ income: 0n, amortization: 0n, realizedSalePnl: 0n });
const output = (totals: Totals) => ({ incomeCents: totals.income.toString(),
  amortizationCents: totals.amortization.toString(), realizedSalePnlCents: totals.realizedSalePnl.toString() });
const PAGE = 100;
const MAX_GROUPS = 5000;

/** Holds only response-sized aggregate groups. Never retains journal or dividend pages. */
export class IncomeAccumulator {
  private readonly totals = empty();
  private readonly periods = new Map<string, Totals>();
  private readonly byAsset = new Map<string, Totals>();
  private readonly byClass = new Map<string, Totals>();
  private readonly catalog = new Map<string, AssetRow>();
  private readonly issues: Array<{ dividendId: string; reason: string }> = [];
  private issueCount = 0;
  private activePaid = new Map<string, DividendRow>();
  private activeReceipts = new Map<string, { count: number; amount: bigint; reason: string | null }>();
  private activeCatalog = new Map<string, AssetRow>();

  constructor(private readonly portfolioId: string, private readonly from: string, private readonly to: string,
    private readonly assetPage = 1, private readonly issuesPage = 1) {}

  private issue(id: string, reason: string) {
    if (this.issueCount >= (this.issuesPage - 1) * PAGE && this.issueCount < this.issuesPage * PAGE) {
      this.issues.push({ dividendId: id, reason });
    }
    this.issueCount++;
  }

  private add(date: Date, assetId: string, field: keyof Totals, amount: bigint) {
    const month = date.toISOString().slice(0, 7);
    this.totals[field] += amount;
    const assetClass = this.catalog.get(assetId)?.class ?? 'unknown';
    for (const [map, key] of [[this.periods, month], [this.byAsset, assetId], [this.byClass, assetClass]] as const) {
      const row = map.get(key) ?? empty();
      row[field] += amount;
      map.set(key, row);
      if (map.size > MAX_GROUPS) throw new RangeError('Report has too many aggregate groups; use a narrower date range');
    }
  }

  /** Begin one paid page; linked receipts can themselves arrive in arbitrarily many pages. */
  beginPaid(paid: DividendRow[], catalog: AssetRow[]) {
    this.activeCatalog = new Map(catalog.map(asset => [asset.id, asset]));
    this.activePaid = new Map(paid.map(row => [row.id, row]));
    this.activeReceipts.clear();
  }

  addReceipts(receipts: TransactionRow[]) {
    for (const row of receipts) {
      if (!row.dividendId) continue;
      const state = this.activeReceipts.get(row.dividendId) ?? { count: 0, amount: 0n, reason: null };
      state.count++;
      const dividend = this.activePaid.get(row.dividendId);
      const type = dividend?.kind === 'rendimento' ? 'dividend' : dividend?.kind;
      if (!dividend || row.assetId !== dividend.assetId || row.type !== type) state.reason = 'MISSING_OR_INVALID_LINKED_RECEIPT';
      else {
        try { state.amount += toBRL(row.qty * row.unitPriceCents, row.currency, row.fxRateToBRL); }
        catch { if (!state.reason) state.reason = 'HISTORICAL_FX_OR_CURRENCY_UNAVAILABLE'; }
      }
      this.activeReceipts.set(row.dividendId, state);
    }
  }

  finishPaid() {
    for (const dividend of this.activePaid.values()) {
      const state = this.activeReceipts.get(dividend.id);
      if (!dividend.paymentDate || !state?.count || state.reason) {
        this.issue(dividend.id, state?.reason ?? 'MISSING_OR_INVALID_LINKED_RECEIPT');
        continue;
      }
      const asset = this.activeCatalog.get(dividend.assetId);
      if (asset) this.catalog.set(asset.id, asset);
      this.add(dividend.paymentDate, dividend.assetId,
        dividend.kind === 'amortizacao' ? 'amortization' : 'income', state.amount);
    }
    this.activePaid.clear();
    this.activeReceipts.clear();
    this.activeCatalog.clear();
  }

  addPaid(paid: DividendRow[], receipts: TransactionRow[], catalog: AssetRow[]) {
    this.beginPaid(paid, catalog);
    this.addReceipts(receipts);
    this.finishPaid();
  }

  addSales(sales: TransactionRow[], catalog: AssetRow[]) {
    for (const asset of catalog) this.catalog.set(asset.id, asset);
    for (const sale of sales) this.add(sale.date, sale.assetId, 'realizedSalePnl', sale.realizedPnlCents);
  }

  result() {
    const assets = [...this.byAsset].sort(([a], [b]) => a.localeCompare(b));
    return { portfolioId: this.portfolioId, from: this.from, to: this.to, currency: 'BRL', unit: 'integer_cents',
      source: { income: 'PAID_DIVIDENDS_WITH_LINKED_JOURNAL_RECEIPTS', realizedSalePnl: 'PERSISTED_JOURNAL_SALES',
        amortization: 'RETURN_OF_CAPITAL_EXCLUDED_FROM_INCOME' },
      totals: output(this.totals), totalsIncomplete: this.issueCount > 0, reconciliationRequired: this.issueCount > 0,
      excludedReceipts: this.issues, excludedReceiptCount: this.issueCount, issuesPage: this.issuesPage,
      issuesHasMore: this.issuesPage * PAGE < this.issueCount,
      periods: [...this.periods].sort(([a], [b]) => a.localeCompare(b)).map(([period, row]) => ({ period, ...output(row) })),
      byAsset: assets.slice((this.assetPage - 1) * PAGE, this.assetPage * PAGE).map(([assetId, row]) => ({ assetId,
        symbol: this.catalog.get(assetId)?.symbol ?? null, assetClass: this.catalog.get(assetId)?.class ?? null, ...output(row) })),
      byAssetCount: assets.length, assetPage: this.assetPage, assetHasMore: this.assetPage * PAGE < assets.length,
      byClass: [...this.byClass].sort(([a], [b]) => a.localeCompare(b)).map(([assetClass, row]) => ({ assetClass, ...output(row) })) };
  }
}

/** Service contract usable with in-memory fixtures; production feeds pages directly from the repository. */
export function incomeReport(portfolioId: string, from: string, to: string, data: {
  paid: DividendRow[]; sales: TransactionRow[]; receipts: TransactionRow[]; catalog: AssetRow[];
}) {
  const report = new IncomeAccumulator(portfolioId, from, to);
  report.addPaid(data.paid, data.receipts, data.catalog);
  report.addSales(data.sales, data.catalog);
  return report.result();
}

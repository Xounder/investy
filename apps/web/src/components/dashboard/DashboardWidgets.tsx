import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { KpiCard } from '@/components/ui/KpiCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { tooltipTheme } from '@/components/charts/theme';
import { money, signedMoney, dateLabel, typeLabels } from '@/lib/journal-format';
import type { JournalEvent, Asset } from '@/lib/journal';
import type { DividendItem } from '@/lib/dividends';
import type { DashboardSummary, SummaryDelta, Allocation, Indicator, AllocationSlice } from '@/lib/dashboard';

const pct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const labels: Record<string, string> = { acao: 'Ações', fii: 'FIIs', etf: 'ETFs', bdr: 'BDRs', renda_fixa: 'Renda fixa', cripto: 'Cripto' };
const panel = 'min-w-0 rounded-xl border border-gray-200 bg-surface p-5';
const allocationPalette = ['#2563EB', '#7C3AED', '#8B5CF6', '#60A5FA', '#A78BFA', '#D1D5DB'];

export function Widget({ title, to, loading, error, retry, children }: { title: string; to: string; loading: boolean; error: boolean; retry: () => void; children: React.ReactNode }) {
  return <section className={panel} aria-label={title}>
    <div className="mb-4 flex items-center justify-between gap-2"><h2 className="font-display text-lg font-bold">{title}</h2><Link className="text-sm text-primary" to={to}>Ver detalhes →</Link></div>
    {loading ? <div role="status" aria-label={`Carregando ${title}`}><Skeleton variant="chart" /></div> : error ? <div role="alert" className="text-sm">Não foi possível carregar {title.toLowerCase()}. <button className="text-primary underline" onClick={retry}>Tentar novamente</button></div> : children}
  </section>;
}

export function QuickActions() {
  const navigate = useNavigate(); const location = useLocation();
  return <div className="flex flex-wrap gap-3"><button className="rounded-lg bg-primary px-4 py-2 text-sm text-white" onClick={() => navigate('/global-action', { state: { background: location } })}>+ Registrar</button><Link className="rounded-lg border border-primary px-4 py-2 text-sm text-primary" to="/transactions/import/nota">Importar nota</Link></div>;
}

const unavailableReasons = {
  NO_SNAPSHOT: 'Sem registro histórico anterior', INCOMPLETE_COVERAGE: 'Histórico incompleto',
  INCOMPLETE_VALUATION: 'Cotação indisponível', MISSING_FX: 'Câmbio indisponível',
} as const;

function deltaChip(delta: SummaryDelta | null, reason: string) {
  if (!delta) return { value: reason, positive: false };
  const sign = BigInt(delta.amountCents) < 0n ? '−' : '+';
  const percent = delta.percent === null ? 'base zero' : `${delta.percent >= 0 ? '+' : '−'}${pct.format(Math.abs(delta.percent))}%`;
  return { value: `${sign}${money((BigInt(delta.amountCents) < 0n ? -BigInt(delta.amountCents) : BigInt(delta.amountCents)).toString())} · ${percent}`, positive: BigInt(delta.amountCents) >= 0n };
}

export function KpiStrip({ summary, loading }: { summary?: DashboardSummary; loading: boolean }) {
  const comparison = summary?.comparison;
  const reason = comparison?.reason ? unavailableReasons[comparison.reason] : 'Comparação indisponível';
  const cards = summary ? [
    { label: 'Patrimônio total', value: money(summary.totalMarketValueCents), change: comparison?.total ?? null },
    { label: 'Custo investido', value: money(summary.totalCostBasisCents), change: comparison?.cost ?? null },
    { label: 'Resultado não realizado', value: signedMoney(summary.unrealizedPnlCents), change: comparison?.unrealized ?? null },
    { label: 'Variação desde registro', value: comparison?.dayMainChange ? signedMoney(comparison.dayMainChange.amountCents) : 'Indisponível', change: comparison?.dayMainChange ?? null },
  ] : Array.from({ length: 4 }, () => ({ label: '', value: '', change: null }));
  const periodLabel = comparison?.previousDate ? `Desde ${dateLabel(comparison.previousDate)} até ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: comparison.timezone }).format(new Date(comparison.currentAt))} (${comparison.timezone})` : reason;
  return <section aria-label="Indicadores da carteira" className="space-y-2"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map((card, i) => <div key={i} data-kpi={card.label}><KpiCard label={card.label} value={card.value} delta={card.change ? deltaChip(card.change, reason) : undefined} loading={loading} />{!loading && !card.change && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900" role="status">{reason}</span>}</div>)}</div>
    {comparison && <p className={`text-xs ${comparison.hasStaleQuotes ? 'text-warning' : 'text-tertiary'}`}>{periodLabel}. Variação observada em BRL inclui aportes e retiradas; não é rentabilidade. {BigInt(summary!.unpricedCostBasisCents) > 0n && `Ativos sem cotação: ${money(summary!.unpricedCostBasisCents)} em custo; patrimônio parcial.`} {comparison.hasStaleQuotes && 'Atenção: há cotações desatualizadas; valores podem estar defasados.'}</p>}</section>;
}

export function MarketIndicators({ items }: { items: Indicator[] }) {
  const symbols = ['CDI', 'SELIC', 'IBOV', 'IFIX', 'SPX'];
  return <div className="flex gap-3 overflow-x-auto pb-1">{symbols.map((symbol) => {
    const item = items.find((i) => i.symbol === symbol);
    const stale = item && Date.now() - new Date(item.date).getTime() > (symbol === 'CDI' || symbol === 'SELIC' ? 7 : 3) * 86400000;
    return <div key={symbol} className={`min-w-32 shrink-0 rounded-lg border p-3 text-sm ${stale ? 'border-amber-300 bg-amber-50' : 'bg-white'}`} aria-label={`${symbol}: ${item ? stale ? 'desatualizado' : 'atualizado' : 'indisponível'}`}><p className="font-semibold">{symbol}</p><p className="font-medium"><span className={`mr-2 inline-block h-2 w-2 rounded-full ${!item || stale ? 'bg-warning' : 'bg-success'}`} />{item ? `${number.format(item.value)}${symbol === 'CDI' || symbol === 'SELIC' ? '%' : ''}` : '—'}</p><p className="text-xs text-tertiary">{item ? dateLabel(item.date) : 'Sem dados'}</p>{stale && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Desatualizado</span>}</div>;
  })}</div>;
}

export function groupSlices(slices: AllocationSlice[]) {
  const total = slices.reduce((sum, slice) => sum + BigInt(slice.valueCents), 0n);
  if (total <= 0n) return [];
  const small = slices.filter((s) => s.key !== 'Outros' && BigInt(s.valueCents) * 100n < total * 3n);
  const large = slices.filter((s) => s.key !== 'Outros' && BigInt(s.valueCents) * 100n >= total * 3n);
  const other = slices.find((s) => s.key === 'Outros');
  const otherValue = small.reduce((sum, s) => sum + BigInt(s.valueCents), BigInt(other?.valueCents ?? '0'));
  return otherValue > 0n ? [...large, { key: 'Outros', valueCents: otherValue.toString(), percent: Number(otherValue * 10000n / total) / 100 }] : large;
}

/** Hamilton allocation in exact basis points; never convert authoritative cents to floats. */
export function allocationPercentages(slices: AllocationSlice[]) {
  const amounts = slices.map((slice) => BigInt(slice.valueCents));
  const total = amounts.reduce((sum, value) => sum + value, 0n);
  if (total <= 0n) return slices.map((slice) => ({ key: slice.key, percent: 0 }));
  const portions = amounts.map((value) => ({ floor: value * 10000n / total, remainder: value * 10000n % total }));
  const result = portions.map((item) => item.floor);
  let remaining = Number(10000n - result.reduce((sum, value) => sum + value, 0n));
  const ranked = slices.map((slice, i) => i).sort((a, b) => {
    const diff = portions[a]!.remainder - portions[b]!.remainder;
    return diff > 0n ? -1 : diff < 0n ? 1 : slices[a]!.key < slices[b]!.key ? -1 : slices[a]!.key > slices[b]!.key ? 1 : a - b;
  });
  for (const index of ranked) { if (remaining-- <= 0) break; result[index] = result[index]! + 1n; }
  return slices.map((slice, i) => ({ key: slice.key, percent: Number(result[i]) / 100 }));
}

export function AllocationDonut({ allocation }: { allocation: Allocation }) {
  const [view, setView] = useState<'byClass' | 'bySector'>('byClass');
  const slices = groupSlices(allocation[view]).filter((s) => BigInt(s.valueCents) > 0n);
  const total = slices.reduce((sum, s) => sum + BigInt(s.valueCents), 0n);
  if (!slices.length) return <p className="text-sm">Sem posições para distribuir. <Link to="/holdings" className="text-primary">Ver carteira</Link></p>;
  const data = allocationPercentages(slices).map((s) => ({ name: labels[s.key] ?? s.key, value: s.percent }));
  return <div><div role="tablist" aria-label="Agrupar alocação" className="mb-3 flex gap-2">{(['byClass', 'bySector'] as const).map((key) => <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)} className={`rounded px-3 py-1 text-sm ${view === key ? 'bg-primary text-white' : 'bg-gray-100'}`}>{key === 'byClass' ? 'Classe' : 'Setor'}</button>)}</div>
    <div className="relative h-56 w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="65%" outerRadius="90%" isAnimationActive={false}>{data.map((s, i) => <Cell key={s.name} fill={allocationPalette[i % allocationPalette.length]} />)}</Pie><Tooltip formatter={(v) => `${pct.format(Number(v))}%`} {...tooltipTheme} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-xs text-tertiary">Total alocado</span><strong className="text-sm">{money(total.toString())}</strong></div></div>
    <div className="flex flex-wrap gap-2">{data.map((s, i) => <span key={s.name} className="rounded-full border px-2 py-1 text-xs"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: allocationPalette[i % allocationPalette.length] }} />{s.name} {pct.format(s.value)}%</span>)}</div>
    <p className="mt-2 text-xs text-tertiary">Valores incluem custo dos ativos sem cotação; podem diferir do patrimônio precificado.</p>
  </div>;
}

export function AgendaPreview({ items }: { items: DividendItem[] }) {
  if (!items.length) return <p className="text-sm">Nenhum provento futuro. <Link className="text-primary" to="/dividends">Ver agenda</Link></p>;
  return <ul className="divide-y text-sm">{items.slice(0, 5).map((item) => <li key={item.id} className="flex justify-between gap-2 py-2"><span>{dateLabel(item.exDate)} · {item.symbol ?? item.assetName ?? 'Ativo'} <span className="text-tertiary">({item.status === 'expected' ? 'Previsto' : 'Confirmado'})</span></span><span>{money(item.rateCentsPerUnit, item.currency)}/cota</span></li>)}</ul>;
}

export function RecentTransactions({ items, assets }: { items: JournalEvent[]; assets: Asset[] }) {
  if (!items.length) return <p className="text-sm">Nenhuma operação. <Link className="text-primary" to="/transactions">Ver transações</Link></p>;
  return <ul className="divide-y text-sm">{items.slice(0, 5).map((item) => <li key={item.id} className="flex justify-between gap-2 py-2"><span>{dateLabel(item.date)} · {typeLabels[item.type] ?? item.type} · {assets.find((a) => a.id === item.assetId)?.symbol ?? 'Ativo'}</span><span>{item.qty ? `${number.format(Number(item.qty))} un.` : '—'}</span></li>)}</ul>;
}

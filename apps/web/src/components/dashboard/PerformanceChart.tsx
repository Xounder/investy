import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Area, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisTheme, chartColors, tooltipTheme } from '@/components/charts/theme';
import { Skeleton } from '@/components/ui/Skeleton';
import { dashboardApi, type Benchmark, type CdiIndex, type Snapshot } from '@/lib/dashboard';

const percent = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const palette = { CDI: '#6B7280', IBOV: '#7C3AED', IFIX: '#16A34A', SPX: '#CA8A04' } as const;

/** A series must have a real observation on the portfolio's common baseline date. */
export function performanceRows(snapshots: Snapshot[], benchmarks: Benchmark[], interval: 'monthly' | 'quarterly', cdi?: CdiIndex | null) {
  const dates = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const complete = cdi?.coverage === 'COMPLETE_THROUGH_LAST_OBSERVATION' && cdi.baseDate !== null && cdi.lastObservationDate !== null &&
    cdi.indexUnit === 'base_100' && cdi.rateUnit === 'percent_per_business_day';
  const cdiMap = new Map(complete ? cdi.indexSeries.map((p) => [p.date.slice(0, 10), p.value]) : []);
  // Use one observed snapshot/CDI date as the common baseline for all lines.
  const overlap = complete ? dates.filter((s) => s.date.slice(0, 10) >= cdi.baseDate! && s.date.slice(0, 10) <= cdi.lastObservationDate! && cdiMap.has(s.date.slice(0, 10))) : [];
  const aligned = overlap.length ? overlap : dates;
  const fallbackStart = new Date(Date.now() - (interval === 'monthly' ? 30 : 90) * 86400000).toISOString().slice(0, 10);
  const points = aligned.filter((s) => s.date.slice(0, 10) >= (cdi?.requestedStartDate ?? fallbackStart));
  const first = points[0];
  if (!first || BigInt(first.totalValueCents) <= 0n) return { rows: [], cdiAligned: false };
  const firstDay = first.date.slice(0, 10);
  const buckets = new Map<string, Snapshot>();
  for (const snap of points) {
    const day = snap.date.slice(0, 10);
    buckets.set(interval === 'monthly' ? day.slice(0, 7) : `${day.slice(0, 4)}-T${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`, snap);
  }
  const samples = [first, ...buckets.values()].filter((s, i, all) => all.findIndex((p) => p.date === s.date) === i);
  const maps = Object.fromEntries(benchmarks.filter((b) => b.symbol !== 'CDI').map((b) => [b.symbol, new Map(b.series.map((p) => [p.date.slice(0, 10), p.value]))])) as Record<string, Map<string, number>>;
  const base = BigInt(first.totalValueCents);
  const bases = Object.fromEntries((['IBOV', 'IFIX', 'SPX'] as const).map((symbol) => [symbol, maps[symbol]?.get(firstDay)]));
  const cdiBase = cdiMap.get(firstDay);
  const cdiAligned = overlap.length > 0 && cdiBase != null && cdiBase > 0;
  const rows = samples.map((snap) => {
    const date = snap.date.slice(0, 10);
    const row: Record<string, number | string | null> = { date, Carteira: Number(BigInt(snap.totalValueCents) * 10000n / base) / 100 };
    for (const symbol of ['IBOV', 'IFIX', 'SPX'] as const) {
      const value = maps[symbol]?.get(date); const start = bases[symbol];
      row[symbol] = value != null && start != null && start > 0 ? value / start * 100 : null;
    }
    const cdiValue = cdiMap.get(date);
    row.CDI = cdiAligned && cdiValue != null && cdiBase != null ? cdiValue / cdiBase * 100 : null;
    return row;
  });
  return { rows, cdiAligned };
}

export function PerformanceChart({ snapshots, benchmarks }: { snapshots: Snapshot[]; benchmarks: Benchmark[] }) {
  const [interval, setInterval] = useState<'monthly' | 'quarterly'>('monthly');
  const range = interval === 'monthly' ? '1m' : '3m';
  const cdi = useQuery({ queryKey: ['dashboard-cdi-index', range], queryFn: () => dashboardApi.cdiIndex(range), retry: false, enabled: snapshots.length > 0 });
  if (!snapshots.length) return <p className="text-sm">Sem histórico de patrimônio disponível. <Link className="text-primary" to="/holdings">Ver carteira</Link></p>;
  const { rows, cdiAligned } = performanceRows(snapshots, benchmarks, interval, cdi.data);
  return <div><div role="tablist" aria-label="Período de desempenho" className="mb-3 flex gap-2">{(['monthly', 'quarterly'] as const).map((value) => <button key={value} role="tab" aria-selected={interval === value} className={`rounded px-3 py-1 text-sm ${interval === value ? 'bg-primary text-white' : 'bg-gray-100'}`} onClick={() => setInterval(value)}>{value === 'monthly' ? 'Mensal' : 'Trimestral'}</button>)}</div>
    {cdi.isPending ? <div role="status" aria-label="Carregando índice CDI"><Skeleton variant="chart" /></div> : !rows.length ? <p className="text-sm">Sem período comparável: valor inicial da carteira indisponível.</p> : <div className="h-56 w-full" aria-label="Evolução indexada da carteira e indicadores"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows}><CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" /><XAxis dataKey="date" tick={axisTheme.tick} tickLine={false} /><YAxis tick={axisTheme.tick} domain={['auto', 'auto']} /><Tooltip {...tooltipTheme} formatter={(v) => percent.format(Number(v))} /><Area dataKey="Carteira" stroke={chartColors.primary} fill={chartColors.primary} fillOpacity={0.1} connectNulls={false} dot={rows.length === 1} />{cdiAligned && <Line dataKey="CDI" stroke={palette.CDI} dot={rows.length === 1} connectNulls={false} />}<Line dataKey="IBOV" stroke={palette.IBOV} dot={rows.length === 1} connectNulls={false} /><Line dataKey="IFIX" stroke={palette.IFIX} dot={rows.length === 1} connectNulls={false} /><Line dataKey="SPX" stroke={palette.SPX} dot={rows.length === 1} connectNulls={false} /></ComposedChart></ResponsiveContainer></div>}
    {!cdi.isPending && <p className="text-xs text-tertiary">Índice base 100 em {rows[0]?.date ?? '—'}; apenas observações na mesma data. {cdiAligned ? `CDI acumulado até ${cdi.data!.lastObservationDate} (última observação; não implica cobertura até hoje). O índice CDI parte do fechamento da primeira observação; a taxa desse primeiro dia não integra a variação exibida.` : `CDI indisponível para comparação: ${cdi.data?.reason === 'PROVIDER_UNAVAILABLE_OR_INCOMPLETE' || cdi.isError ? 'provedor indisponível ou cobertura incompleta' : 'sem data-base comum com a carteira'}.`} Patrimônio inclui aportes/saques: não representa rentabilidade ajustada por fluxos.</p>}
  </div>;
}

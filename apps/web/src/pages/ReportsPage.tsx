import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisTheme, chartColors, tooltipTheme } from '@/components/charts/theme';
import { PortfolioSelector } from '@/components/selectors/PortfolioSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { dashboardApi } from '@/lib/dashboard';
import { journalApi, errorText } from '@/lib/journal';
import { money, pnlTone, signedMoney } from '@/lib/journal-format';
import { comparison, comparisonSymbols, incomeMonths, pnlPeriods, reportsApi, type Granularity } from '@/lib/reports';
import { useUiStore } from '@/stores/ui';

const colors: Record<string, string> = { Carteira: chartColors.primary, CDI: chartColors.tertiary, IBOV: chartColors.secondary, IFIX: chartColors.success, SPX: chartColors.warning };
const percent = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const incomeColors = [chartColors.secondary, chartColors.primary, chartColors.success, chartColors.warning, chartColors.tertiary, chartColors.error];

function Section({ title, pending, error, retry, children }: { title: string; pending: boolean; error: unknown; retry: () => void; children: React.ReactNode }) {
  return <section aria-label={title} className="rounded-xl border bg-white p-4 sm:p-6 space-y-4">
    <h2 className="font-display text-lg font-semibold">{title}</h2>
    {pending ? <div role="status" aria-label={`Carregando ${title}`}><Skeleton variant="chart" /></div> : error ?
      <div role="alert">{errorText(error)} <button className="text-primary underline" onClick={retry}>Tentar novamente</button></div> : children}
  </section>;
}

export default function ReportsPage() {
  const active = useUiStore((s) => s.activePortfolioId);
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [year, setYear] = useState(new Date().getFullYear());
  const portfolios = useQuery({ queryKey: ['portfolios'], queryFn: journalApi.portfolios });
  const selected = portfolios.data?.find((p) => p.id === active) ?? portfolios.data?.find((p) => p.isDefault) ?? portfolios.data?.[0];
  const id = selected?.id;
  const snapshots = useQuery({ queryKey: ['reports-snapshots', id], queryFn: () => reportsApi.snapshots(id!), enabled: !!id });
  const benchmarks = useQuery({ queryKey: ['dashboard-benchmarks'], queryFn: dashboardApi.benchmarks, enabled: !!id });
  const cdi = useQuery({ queryKey: ['dashboard-cdi-index', '3m'], queryFn: () => dashboardApi.cdiIndex('3m'), enabled: !!id, retry: false });
  const sales = useQuery({ queryKey: ['reports-sales', id], queryFn: () => reportsApi.sales(id!), enabled: !!id });
  const income = useQuery({ queryKey: ['reports-income', id, year], queryFn: () => reportsApi.income(year), enabled: !!id });
  const compared = comparison(snapshots.data ?? [], benchmarks.data ?? [], cdi.data, granularity);
  const rows = compared.rows;
  const pnl = sales.data ? pnlPeriods(sales.data.items, granularity) : [];
  const months = income.data && id ? incomeMonths(income.data, id) : [];
  const classes = [...new Set(months.flatMap((m) => [...m.byClass.keys()]))].sort();
  const bars = months.map((m) => ({ key: m.key, ...Object.fromEntries(classes.map((key) => [key, Number(m.byClass.get(key) ?? 0n) / 100])) }));
  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-display text-2xl font-bold">Relatórios e análises</h1><p className="text-sm text-tertiary">Dados observados da carteira {selected?.name ?? ''}</p></div><PortfolioSelector /></header>
    {portfolios.isError && <div role="alert">{errorText(portfolios.error)} <button className="text-primary" onClick={() => void portfolios.refetch()}>Tentar novamente</button></div>}
    {!portfolios.isPending && !portfolios.isError && !id && <p className="rounded-xl border bg-white p-6">Crie uma carteira para começar. <Link to="/onboarding" className="text-primary">Criar carteira</Link></p>}
    {id && <>
      <div role="group" aria-label="Agrupamento dos relatórios" className="flex gap-2">{(['month', 'quarter'] as const).map((value) => <button key={value} type="button" aria-pressed={granularity === value} className={`rounded px-4 py-2 text-sm ${granularity === value ? 'bg-primary text-white' : 'bg-white border'}`} onClick={() => setGranularity(value)}>{value === 'month' ? 'Mensal' : 'Trimestral'}</button>)}</div>
      <Section title="Desempenho comparado" pending={snapshots.isPending || benchmarks.isPending || cdi.isPending} error={snapshots.error ?? benchmarks.error} retry={() => { void snapshots.refetch(); void benchmarks.refetch(); void cdi.refetch(); }}>
        {!rows.length ? <p>Sem snapshots e fechamentos de índices em uma data-base comum. <Link to="/holdings" className="text-primary">Ver carteira</Link></p> : <>
          <p className="text-xs text-tertiary">Índice base 100 em {compared.baseDate}, data observada tanto na carteira quanto nos índices disponíveis abaixo. Agrupamento {granularity === 'month' ? 'mensal' : 'trimestral'}: cada data exibida é uma observação real; em cada período, preservamos o último patrimônio e o último fechamento comparável de cada índice. Patrimônio observado inclui aportes e saques; não é rentabilidade ajustada por fluxos. Janela: últimos três meses. Nenhum fechamento é estimado para datas ausentes. CDI: {cdi.isError || !compared.status.CDI.available ? 'indisponível para esta comparação' : `índice acumulado até ${cdi.data?.lastObservationDate}; parte do fechamento da primeira observação (taxa inicial excluída)`}.</p>
          <div className="h-64 w-full" aria-label="Gráfico de patrimônio e índices base 100"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows}><CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" /><XAxis dataKey="date" tick={axisTheme.tick} /><YAxis tick={axisTheme.tick} domain={['auto', 'auto']} /><Tooltip {...tooltipTheme} formatter={(value) => `${percent.format(Number(value))} (base 100)`} /><Area dataKey="Carteira" stroke={colors.Carteira} fill={colors.Carteira} fillOpacity={0.1} dot={rows.length === 1} />{(['CDI', 'IBOV', 'IFIX', 'SPX'] as const).map((key) => <Line key={key} dataKey={key} stroke={colors[key]} connectNulls={false} dot={rows.length === 1} />)}</ComposedChart></ResponsiveContainer></div>
          <div aria-label="Legenda do desempenho" className="flex flex-wrap gap-3 text-xs"><span style={{ color: colors.Carteira }}>● Carteira</span>{comparisonSymbols.map((name) => <span key={name} style={{ color: compared.status[name].available ? colors[name] : undefined }}>● {name}: {compared.status[name].available ? `disponível; ${compared.status[name].reason}` : `indisponível; ${compared.status[name].reason}`}{compared.status[name].available ? `; última data comparável ${compared.status[name].lastComparableDate}` : ''}</span>)}</div>
          <div className="overflow-x-auto"><table className="w-full text-sm tabular-nums"><caption className="sr-only">Observações de patrimônio e índices base 100</caption><thead><tr><th scope="col" className="text-left">Data</th>{Object.keys(colors).map((key) => <th key={key} scope="col" className="text-right p-2">{key}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.date} className="border-t"><th scope="row" className="text-left">{row.date}</th>{Object.keys(colors).map((key) => <td key={key} className="text-right p-2">{row[key] == null ? '—' : percent.format(Number(row[key]))}</td>)}</tr>)}</tbody></table></div>
        </>}
      </Section>
      <Section title="Resultado realizado em vendas" pending={sales.isPending} error={sales.error} retry={() => void sales.refetch()}>
        {sales.data?.truncated && <p role="alert" className="text-amber-800">Histórico parcial: limite de 10.000 vendas atingido. Totais exibidos não abrangem todas as vendas.</p>}
        {sales.data?.items.some((sale) => sale.realizedPnlCents === null) && <p role="alert" className="text-amber-800">Resultado parcial: vendas sem lucro realizado persistido (câmbio histórico pendente) foram excluídas.</p>}
        {!pnl.length ? <p>Nenhum resultado realizado disponível.</p> : <div className="overflow-x-auto"><table className="w-full text-sm tabular-nums"><thead><tr><th scope="col" className="text-left p-2">Período</th><th scope="col" className="text-right p-2">Ganho ou perda (BRL)</th></tr></thead><tbody>{pnl.map((item) => <tr className="border-t" key={item.key}><th scope="row" className="text-left p-2">{item.key}</th><td className={`text-right p-2 ${pnlTone(item.cents)}`}>{signedMoney(item.cents)}</td></tr>)}</tbody></table></div>}
      </Section>
      <Section title="Renda mensal por classe" pending={income.isPending} error={income.error} retry={() => void income.refetch()}>
        <label className="text-sm">Ano <input aria-label="Ano da renda" type="number" min="1" max="9999" value={year} onChange={(event) => { const value = Number(event.target.value); if (value >= 1 && value <= 9999) setYear(value); }} className="w-24 rounded border p-2" /></label>
        {months.some((m) => m.partial) && <p role="alert" className="text-amber-800">Totais parciais: pagamentos legados sem recebimento conciliado não integram os valores exibidos.</p>}
        <p className="text-xs text-tertiary">Somente recebimentos pagos comprovados em BRL. Amortizações são devoluções de capital e não integram a renda.</p>
        {!months.length ? <p>Nenhum dividendo recebido neste período.</p> : <>
          {classes.length > 0 && <div className="h-56 w-full" aria-label="Gráfico de renda por classe"><ResponsiveContainer width="100%" height="100%"><BarChart data={bars}><CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" /><XAxis dataKey="key" tick={axisTheme.tick} /><YAxis tick={axisTheme.tick} /><Tooltip {...tooltipTheme} formatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))} />{classes.map((key, index) => <Bar key={key} dataKey={key} stackId="renda" fill={incomeColors[index % incomeColors.length]} />)}</BarChart></ResponsiveContainer></div>}
          <div aria-label="Legenda da renda" className="flex flex-wrap gap-3 text-xs">{classes.map((key, i) => <span key={key} style={{ color: incomeColors[i % incomeColors.length] }}>● {key}</span>)}</div>
          <div className="overflow-x-auto"><table className="w-full text-sm tabular-nums"><thead><tr><th scope="col" className="text-left p-2">Mês</th>{classes.map((key) => <th scope="col" className="text-right p-2" key={key}>{key}</th>)}<th scope="col" className="text-right p-2">Total</th></tr></thead><tbody>{months.map((m) => <tr className="border-t" key={m.key}><th scope="row" className="text-left p-2">{m.key}{m.partial ? ' (parcial)' : ''}</th>{classes.map((key) => <td className="text-right p-2" key={key}>{money(String(m.byClass.get(key) ?? 0n))}</td>)}<td className="text-right p-2">{money(m.total)}</td></tr>)}</tbody></table></div>
        </>}
      </Section>
    </>}
  </div>;
}

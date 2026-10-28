import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PortfolioSelector } from '@/components/selectors/PortfolioSelector';
import { Widget, QuickActions, KpiStrip, MarketIndicators, AllocationDonut, AgendaPreview, RecentTransactions } from '@/components/dashboard/DashboardWidgets';
import { PerformanceChart } from '@/components/dashboard/PerformanceChart';
import { dashboardApi } from '@/lib/dashboard';
import { dividendsApi } from '@/lib/dividends';
import { journalApi } from '@/lib/journal';
import { useUiStore } from '@/stores/ui';

export default function DashboardPage() {
  const active = useUiStore((s) => s.activePortfolioId);
  const portfolios = useQuery({ queryKey: ['portfolios'], queryFn: journalApi.portfolios });
  const selected = portfolios.data?.find((p) => p.id === active) ?? portfolios.data?.find((p) => p.isDefault) ?? portfolios.data?.[0];
  const id = selected?.id;
  const summary = useQuery({ queryKey: ['dashboard-summary', id], queryFn: () => dashboardApi.summary(id!), enabled: !!id });
  const allocation = useQuery({ queryKey: ['dashboard-allocation', id], queryFn: () => dashboardApi.allocation(id!), enabled: !!id });
  const snapshots = useQuery({ queryKey: ['dashboard-snapshots', id], queryFn: () => dashboardApi.snapshots(id!), enabled: !!id });
  const indicators = useQuery({ queryKey: ['dashboard-indicators'], queryFn: dashboardApi.indicators, retry: false });
  const benchmarks = useQuery({ queryKey: ['dashboard-benchmarks'], queryFn: dashboardApi.benchmarks });
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const end = new Date(today); end.setUTCFullYear(end.getUTCFullYear() + 1);
  const to = end.toISOString().slice(0, 10);
  const agenda = useQuery({ queryKey: ['dashboard-agenda', from, to], queryFn: () => dividendsApi.agenda(from, to) });
  const params = new URLSearchParams({ page: '1' });
  if (id) params.set('portfolioId', id);
  const transactions = useQuery({ queryKey: ['dashboard-transactions', id], queryFn: () => journalApi.transactions(params), enabled: !portfolios.isPending });
  const catalog = useQuery({ queryKey: ['asset-catalog'], queryFn: journalApi.catalog, enabled: !!transactions.data?.items.length });
  const portfolioError = portfolios.isError;
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-display text-2xl font-bold">Seu painel de investimentos</h1><p className="text-sm text-tertiary">Visão geral da carteira {selected?.name ?? ''}</p></div><QuickActions /></header>
    <div className="sm:hidden"><PortfolioSelector /></div>
    {portfolios.data && !active && portfolios.data.length > 1 && <p className="text-sm text-tertiary">Exibindo a carteira {selected?.name}. Selecione outra carteira para ver seus indicadores.</p>}
    {!portfolios.isPending && !portfolioError && !selected && <div className="rounded-xl border bg-white p-6">Comece criando uma carteira. <Link className="text-primary" to="/onboarding">Criar carteira</Link></div>}
    {(selected || portfolios.isPending) && <Widget title="Resumo da carteira" to="/holdings" loading={false} error={summary.isError} retry={() => { void summary.refetch(); }}>
      {summary.data?.holdingsCount === 0 ? <p className="text-sm">Sua carteira ainda não possui ativos. <Link className="text-primary" to="/global-action">Registrar primeira operação</Link></p> : null}
      <KpiStrip summary={summary.data} loading={summary.isPending} />
    </Widget>}
    {portfolioError && <div role="alert">Não foi possível carregar carteiras. <button className="text-primary" onClick={() => void portfolios.refetch()}>Tentar novamente</button></div>}
    <Widget title="Indicadores de mercado" to="/reports" loading={indicators.isPending || benchmarks.isPending} error={indicators.isError} retry={() => { void indicators.refetch(); void benchmarks.refetch(); }}><MarketIndicators items={[...(indicators.data ?? []), ...((benchmarks.data?.find((b) => b.symbol === 'SPX')?.series.slice(0, 1) ?? []).map((point) => ({ symbol: 'SPX', value: point.value, date: point.date })))]} /></Widget>
    {selected && <div className="grid gap-4 lg:grid-cols-2">
      <Widget title="Alocação" to="/holdings" loading={allocation.isPending} error={allocation.isError} retry={() => { void allocation.refetch(); }}>{allocation.data && <AllocationDonut allocation={allocation.data} />}</Widget>
      <Widget title="Evolução do patrimônio" to="/reports" loading={snapshots.isPending || benchmarks.isPending} error={snapshots.isError || benchmarks.isError} retry={() => { void snapshots.refetch(); void benchmarks.refetch(); }}>{snapshots.data && benchmarks.data && <PerformanceChart snapshots={snapshots.data} benchmarks={benchmarks.data} />}</Widget>
    </div>}
    <div className="grid gap-4 lg:grid-cols-2">
      <Widget title="Próximos proventos" to="/dividends" loading={agenda.isPending} error={agenda.isError} retry={() => { void agenda.refetch(); }}><AgendaPreview items={(agenda.data?.items ?? []).filter((item) => item.status !== 'paid' && item.exDate.slice(0, 10) >= from)} /></Widget>
      <Widget title="Transações recentes" to="/transactions" loading={transactions.isPending || catalog.isPending && !!transactions.data?.items.length} error={transactions.isError || catalog.isError} retry={() => { void transactions.refetch(); void catalog.refetch(); }}><RecentTransactions items={transactions.data?.items ?? []} assets={catalog.data ?? []} /></Widget>
    </div>
  </div>;
}

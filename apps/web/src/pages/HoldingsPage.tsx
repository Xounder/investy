import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { HoldingsTable } from '@/components/tables/HoldingsTable';
import { PortfolioSelector } from '@/components/selectors/PortfolioSelector';
import { journalApi, errorText } from '@/lib/journal';
import { useUiStore } from '@/stores/ui';

export default function HoldingsPage() {
  const portfolioId = useUiStore((s) => s.activePortfolioId);
  const navigate = useNavigate();
  const location = useLocation();
  const query = useQuery({ queryKey: ['holdings', portfolioId], queryFn: () => journalApi.holdings(portfolioId) });
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-2xl font-bold">Posições</h1><div className="sm:hidden"><PortfolioSelector /></div></div>
    {query.isPending ? <div role="status" aria-label="Carregando posições" className="animate-pulse space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded bg-gray-200" />)}</div> : query.isError ? <div role="alert">{errorText(query.error)} <button onClick={() => query.refetch()} className="text-primary">Tentar novamente</button></div> : !query.data.length ? <div className="rounded-xl border bg-white p-8 text-center"><p>Nenhuma posição ainda.</p><button className="mt-3 text-primary" onClick={() => navigate('/global-action', { state: { background: location } })}>Registrar primeira operação</button></div> : <HoldingsTable rows={query.data} />}
  </div>;
}

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { journalApi } from '@/lib/journal';
import { useUiStore } from '@/stores/ui';

export function PortfolioSelector() {
  const { data, isPending, isError } = useQuery({ queryKey: ['portfolios'], queryFn: journalApi.portfolios });
  const selected = useUiStore((state) => state.activePortfolioId);
  const setSelected = useUiStore((state) => state.setActivePortfolioId);
  if (isPending) return <span role="status" className="text-sm text-tertiary">Carregando carteiras...</span>;
  if (isError) return <span role="alert" className="text-sm text-red-700">Erro ao carregar carteiras</span>;
  if (!data.length) return <Link to="/onboarding" className="text-sm text-primary">Criar primeira carteira</Link>;
  return <label className="text-sm">Carteira <select aria-label="Carteira" className="rounded-lg border border-gray-200 bg-surface px-2 py-2" value={data.some((p) => p.id === selected) ? selected! : ''} onChange={(e) => setSelected(e.target.value || null)}>
    <option value="">Todas as carteiras</option>
    {data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
  </select></label>;
}

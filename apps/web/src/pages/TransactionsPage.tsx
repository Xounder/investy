import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { JournalTable } from '@/components/tables/JournalTable';
import { journalApi, errorText } from '@/lib/journal';
import { typeLabels } from '@/lib/journal-format';
import { useUiStore } from '@/stores/ui';
import { PortfolioSelector } from '@/components/selectors/PortfolioSelector';

const input = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm';
export default function TransactionsPage() {
  const portfolioId = useUiStore((s) => s.activePortfolioId);
  const [accountId, setAccountId] = useState('');
  const [assetSearch, setAssetSearch] = useState('');
  const [assetId, setAssetId] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); setAccountId(''); }, [portfolioId]);
  const navigate = useNavigate();
  const location = useLocation();
  const portfolios = useQuery({ queryKey: ['portfolios'], queryFn: journalApi.portfolios });
  const eligiblePortfolios = portfolioId ? [portfolioId] : portfolios.data?.map((p) => p.id) ?? [];
  const accounts = useQuery({
    queryKey: ['journal-accounts', eligiblePortfolios],
    queryFn: async () => (await Promise.all(eligiblePortfolios.map((id) => journalApi.accounts(id)))).flat(),
    enabled: !!eligiblePortfolios.length,
  });
  const eligibleAccountId = accounts.data?.some((a) => a.id === accountId) ? accountId : '';
  const assets = useQuery({ queryKey: ['assets', assetSearch], queryFn: () => journalApi.assets(assetSearch), enabled: assetSearch.length > 0 });
  const catalog = useQuery({ queryKey: ['asset-catalog'], queryFn: journalApi.catalog });
  const params = new URLSearchParams({ page: String(page) });
  if (portfolioId) params.set('portfolioId', portfolioId);
  if (eligibleAccountId) params.set('accountId', eligibleAccountId);
  if (assetId) params.set('assetId', assetId);
  if (type) params.set('type', type);
  if (from) params.set('from', `${from}T00:00:00.000Z`);
  if (to) params.set('to', `${to}T23:59:59.999Z`);
  const query = useQuery({ queryKey: ['transactions', params.toString()], queryFn: () => journalApi.transactions(params) });
  const symbolMap = Object.fromEntries((catalog.data ?? []).map((a) => [a.id, a]));
  return <div className="space-y-5"><div className="flex justify-between"><h1 className="font-display text-2xl font-bold">Transações</h1><div className="sm:hidden"><PortfolioSelector /></div></div>
    <Link to="/transactions/import" className="inline-block rounded-lg bg-primary px-4 py-2 text-sm text-white">Importar transações ou nota</Link>
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">Conta <select className={input} value={eligibleAccountId} onChange={(e) => { setAccountId(e.target.value); setPage(1); }}><option value="">Todas</option>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      {accounts.isError && <p role="alert">{errorText(accounts.error)}</p>}
      <label className="text-sm">Ativo <input className={input} placeholder="Buscar ativo" value={assetSearch} onChange={(e) => { setAssetSearch(e.target.value); setAssetId(''); setPage(1); }} /></label>
      {!!assetSearch && <select aria-label="Filtrar ativo" className={input} value={assetId} onChange={(e) => { setAssetId(e.target.value); setPage(1); }}><option value="">Todos os ativos</option>{assets.data?.items.map((a) => <option key={a.id} value={a.id}>{a.symbol} — {a.name}</option>)}</select>}
      <label className="text-sm">Tipo <select className={input} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">Todos</option>{Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="text-sm">De <input className={input} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
      <label className="text-sm">Até <input className={input} type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
    </div>
    {query.isPending ? <div role="status" aria-label="Carregando transações" className="animate-pulse space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded bg-gray-200" />)}</div> : query.isError ? <div role="alert">{errorText(query.error)} <button className="text-primary" onClick={() => query.refetch()}>Tentar novamente</button></div> : !query.data.items.length ? <div className="rounded-xl border bg-white p-8 text-center">Nenhuma transação encontrada. <button className="text-primary" onClick={() => navigate('/global-action', { state: { background: location } })}>Registrar primeira operação</button></div> : <JournalTable rows={query.data.items} assets={symbolMap} />}
    <nav aria-label="Paginação" className="flex items-center gap-4"><button disabled={page === 1} className="text-primary disabled:opacity-40" onClick={() => setPage((p) => p - 1)}>Anterior</button><span>Página {page}</span><button disabled={!query.data?.hasMore} className="text-primary disabled:opacity-40" onClick={() => setPage((p) => p + 1)}>Próxima</button></nav>
  </div>;
}

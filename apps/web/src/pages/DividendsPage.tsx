import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AgendaTimeline } from '@/components/dividends/AgendaTimeline';
import { CreateDividendForm } from '@/components/dividends/CreateDividendForm';
import { FiiProjectionCard } from '@/components/dividends/FiiProjectionCard';
import { IncomeHistory } from '@/components/dividends/IncomeHistory';
import { Skeleton } from '@/components/ui/Skeleton';
import { dividendsApi, type CreateDividend } from '@/lib/dividends';
import { journalApi, errorText } from '@/lib/journal';

export default function DividendsPage() {
  const today = new Date();
  const [tab, setTab] = useState<'agenda' | 'history'>('agenda');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState('');
  const queryClient = useQueryClient();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const agenda = useQuery({ queryKey: ['dividends', 'agenda', from, to], queryFn: () => dividendsApi.agenda(from, to), enabled: tab === 'agenda' });
  const history = useQuery({ queryKey: ['dividends', 'history', year, month], queryFn: () => dividendsApi.history(year, month || undefined), enabled: tab === 'history' });
  const portfolios = useQuery({ queryKey: ['portfolios'], queryFn: journalApi.portfolios, enabled: showForm });
  const catalog = useQuery({ queryKey: ['asset-catalog'], queryFn: journalApi.catalog, enabled: showForm || !!agenda.data?.projections.length });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['dividends'] }); };
  const create = useMutation({ mutationFn: (body: CreateDividend) => dividendsApi.create(body), onSuccess: async () => {
    setFeedback('Provento registrado.'); setShowForm(false); await refresh();
  }, onError: (error) => setFeedback(errorText(error)) });
  const update = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: { status: 'confirmed' | 'paid'; paymentDate?: string; fxRateToBRL?: string } }) => dividendsApi.update(id, patch), onSuccess: async () => {
    setFeedback('Provento atualizado.'); await refresh();
    await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    await queryClient.invalidateQueries({ queryKey: ['holdings'] });
  }, onError: (error) => setFeedback(errorText(error)) });
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-display text-2xl font-bold">Proventos</h1><p className="text-sm text-tertiary">Agenda por data-com e histórico de renda de todas as carteiras.</p></div>
      <button className="rounded bg-primary px-4 py-2 text-white" onClick={() => { setFeedback(''); setShowForm((open) => !open); }}>Registrar provento</button></div>
    {feedback && <p role="alert" className="rounded border bg-white p-3 text-sm">{feedback}</p>}
    {showForm && (portfolios.isPending || catalog.isPending ? <div role="status" aria-label="Carregando formulário"><Skeleton variant="card" /></div> : portfolios.isError || catalog.isError ? <div role="alert" className="rounded border p-4">{errorText(portfolios.error ?? catalog.error)} <button className="text-primary" onClick={() => { void portfolios.refetch(); void catalog.refetch(); }}>Tentar novamente</button></div> : <CreateDividendForm portfolios={portfolios.data} assets={catalog.data} busy={create.isPending} onSubmit={async (body) => { setFeedback(''); await create.mutateAsync(body).catch(() => undefined); }} onCancel={() => setShowForm(false)} />)}
    <div role="tablist" aria-label="Visões de proventos" className="flex gap-3 border-b"><button role="tab" aria-selected={tab === 'agenda'} className={`p-3 ${tab === 'agenda' ? 'border-b-2 border-primary font-semibold' : ''}`} onClick={() => setTab('agenda')}>Agenda</button><button role="tab" aria-selected={tab === 'history'} className={`p-3 ${tab === 'history' ? 'border-b-2 border-primary font-semibold' : ''}`} onClick={() => setTab('history')}>Histórico de renda</button></div>
    <div className="flex flex-wrap items-center gap-3"><label className="text-sm">Ano <input aria-label="Ano" className="w-24 rounded border p-2" type="number" min="1" max="9999" value={year} onChange={(e) => { const value = Number(e.target.value); if (value >= 1 && value <= 9999) setYear(value); }} /></label>
      {tab === 'history' && <label className="text-sm">Mês <select className="rounded border p-2" value={month} onChange={(e) => setMonth(Number(e.target.value))}><option value={0}>Todos</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, i, 1)))}</option>)}</select></label>}</div>
    {tab === 'agenda' ? <>
      {agenda.isPending ? <div role="status" aria-label="Carregando agenda" className="space-y-3"><Skeleton variant="card" /><Skeleton variant="card" /></div> : agenda.isError ? <div role="alert">{errorText(agenda.error)} <button className="text-primary" onClick={() => void agenda.refetch()}>Tentar novamente</button></div> : <>
        {!agenda.data.items.length ? <div className="rounded-xl border bg-white p-8 text-center">Nenhum provento neste ano. <button className="text-primary" onClick={() => setShowForm(true)}>Adicionar manualmente</button></div> : <AgendaTimeline items={agenda.data.items} busy={update.isPending} onUpdate={async (id, patch) => { setFeedback(''); await update.mutateAsync({ id, patch }).catch(() => undefined); }} />}
        <section className="space-y-3"><h2 className="font-semibold">Projeções de FIIs</h2>{!agenda.data.projections.length ? <p className="rounded-xl border bg-white p-4 text-sm">Sem projeções disponíveis: são necessárias pelo menos duas datas-com históricas de um FII.</p> : <div className="grid gap-3 md:grid-cols-2">{agenda.data.projections.map((projection) => <FiiProjectionCard key={projection.assetId} projection={projection} symbol={catalog.data?.find((asset) => asset.id === projection.assetId)?.symbol ?? agenda.data.items.find((item) => item.assetId === projection.assetId)?.symbol ?? 'FII'} />)}</div>}</section>
      </>}
    </> : history.isPending ? <div role="status" aria-label="Carregando histórico" className="space-y-3"><Skeleton variant="card" /><Skeleton variant="table" /></div> : history.isError ? <div role="alert">{errorText(history.error)} <button className="text-primary" onClick={() => void history.refetch()}>Tentar novamente</button></div> : <IncomeHistory history={history.data} />}
  </div>;
}

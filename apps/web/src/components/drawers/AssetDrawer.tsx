import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { journalApi, errorText } from '@/lib/journal';
import { dateLabel, money, quantity, typeLabels } from '@/lib/journal-format';

export function AssetDrawer() {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const background = (location.state as { background?: { pathname: string } } | null)?.background;
  const detail = useQuery({ queryKey: ['asset', symbol], queryFn: () => journalApi.asset(symbol), enabled: !!symbol });
  const position = useQuery({ queryKey: ['position', detail.data?.asset.id], queryFn: () => journalApi.position(detail.data!.asset.id), enabled: !!detail.data?.asset.id, retry: false });
  function close() { if (background || window.history.state?.idx > 0) navigate(-1); else navigate('/holdings', { replace: true }); }
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-label={`Detalhes de ${symbol}`} className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex justify-between"><h1 className="text-xl font-bold">{symbol}</h1><button onClick={close} aria-label="Fechar" type="button">✕</button></div>
      {detail.isPending ? <div role="status" className="mt-6 h-36 animate-pulse rounded bg-gray-200" /> : detail.isError ? <p role="alert" className="mt-6">{(detail.error as { status?: number }).status === 404 ? 'Ativo não encontrado.' : errorText(detail.error)} <button className="text-primary" onClick={() => detail.refetch()}>Tentar novamente</button></p> : <div className="mt-6 space-y-5">
        <p>{detail.data.asset.name} · {detail.data.asset.class}</p>
        <div className="rounded-lg bg-gray-50 p-4 tabular-nums"><h2 className="font-semibold">{detail.data.userOverride ? 'Preço manual ativo' : 'Cotação do provedor'}</h2><p>{detail.data.userOverride ? money(detail.data.userOverride.priceCents, detail.data.userOverride.currency) : money(detail.data.lastQuote?.priceCents, detail.data.lastQuote?.currency ?? detail.data.asset.currency)}</p>{detail.data.lastQuote?.isStale && <p className="text-amber-700">Cotação do provedor desatualizada</p>}</div>
        {position.isPending ? <div role="status" className="h-36 animate-pulse rounded bg-gray-200" /> : position.isError ? <p role="status">{(position.error as { status?: number }).status === 404 ? 'Sem posição neste ativo.' : errorText(position.error)}</p> : <>
          <p className="tabular-nums">Posição: {quantity(position.data.summary.qty)} · Cotação BRL: {money(position.data.summary.priceCentsBRL)}</p>
          <section><h2 className="font-semibold">Lotes</h2>{position.data.lots.length ? <div className="overflow-x-auto"><table className="w-full min-w-[400px] text-sm tabular-nums"><thead><tr><th>Data</th><th>Conta</th><th>Qtd.</th><th>Custo</th></tr></thead><tbody>{position.data.lots.map((lot, i) => <tr key={i} className="border-t"><td>{lot.date ? dateLabel(lot.date) : '—'}</td><td>{lot.accountId}</td><td>{quantity(lot.qty)}</td><td>{money(lot.costBasisCents)}</td></tr>)}</tbody></table></div> : <p>Sem lotes abertos.</p>}</section>
          <section><h2 className="font-semibold">Eventos</h2>{position.data.events.length ? <ul className="space-y-2">{position.data.events.map((event) => <li key={event.id} className="border-b py-2 text-sm tabular-nums">{dateLabel(event.date)} · {typeLabels[event.type] ?? event.type} · {quantity(event.qty)} · {money(event.unitPriceCents, event.currency ?? detail.data.asset.currency)}</li>)}</ul> : <p>Sem eventos.</p>}</section>
        </>}
      </div>}
    </section>
  </div>;
}

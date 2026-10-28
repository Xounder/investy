import { useState } from 'react';
import type { DividendItem } from '@/lib/dividends';
import { kindLabels } from '@/lib/dividends';
import { dateLabel, money, quantity, toFxMicro } from '@/lib/journal-format';

const statuses = { expected: 'Previsto', confirmed: 'Confirmado', paid: 'Pago' };

function AgendaEntry({ item, onUpdate, busy }: {
  item: DividendItem;
  onUpdate: (id: string, patch: { status: 'confirmed' | 'paid'; paymentDate?: string; fxRateToBRL?: string }) => Promise<void>;
  busy: boolean;
}) {
  const [paymentDate, setPaymentDate] = useState(item.paymentDate ?? '');
  const [fxInput, setFxInput] = useState('');
  const needsFx = item.currency === 'USD';
  const fxRate = needsFx ? toFxMicro(fxInput) : null;
  return <li className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><strong>{item.symbol ?? 'Ativo não encontrado'}</strong> <span className="text-tertiary">{item.assetName ?? item.assetId}</span></div>
      <span className="rounded-full bg-gray-100 px-3 py-1 text-sm" aria-label={`Status ${statuses[item.status]}; pagamento: ${item.paymentDate ? dateLabel(item.paymentDate) : 'data não informada'}`}>
        {statuses[item.status]} · Pagamento: {item.paymentDate ? dateLabel(item.paymentDate) : 'data não informada'}
      </span>
    </div>
    <p className="text-sm">{kindLabels[item.kind]} · {quantity(item.eligibleQty)} cotas × {money(item.rateCentsPerUnit, item.currency)} = {money(item.nativeAmountCents, item.currency)}{item.reconciliationRequired ? ' (estimativa por posição, não é valor recebido)' : needsFx && ' (valor na moeda original)'}</p>
    {item.reconciliationRequired ? <p role="alert" className="text-sm text-amber-800">Pagamento legado sem vínculo confiável com o recebimento. Conciliação necessária; valor recebido não confirmado.</p> : item.amountCentsBRL !== null ? needsFx && <p className="text-sm">Valor contabilizado em BRL: {money(item.amountCentsBRL)}</p> : <p className="text-sm">Valor em BRL indisponível até informar o câmbio histórico no recebimento.</p>}
    {item.category === 'return_of_capital' && <p className="text-sm text-amber-800">Devolução de capital — não contabilizada como renda.</p>}
    <p className="text-sm">{item.source === 'provider' ? 'Fonte: provedor' : 'Fonte: registro manual'}</p>
    {item.status === 'expected' && <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm">Confirmar data de pagamento <input aria-label={`Data de pagamento de ${item.symbol ?? item.assetId}`} className="block rounded border p-2" type="date" min={item.exDate} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></label>
      <button className="rounded bg-primary px-3 py-2 text-sm text-white disabled:opacity-50" disabled={busy || !paymentDate || paymentDate <= item.exDate} onClick={() => onUpdate(item.id, { status: 'confirmed', paymentDate })}>Confirmar data</button>
    </div>}
    {item.status === 'confirmed' && <div className="space-y-2">
      {needsFx && <label className="block text-sm">Câmbio histórico na data do recebimento (R$ por US$ 1) <input className="block rounded border p-2" inputMode="decimal" placeholder="5,250000" value={fxInput} onChange={(e) => setFxInput(e.target.value)} /></label>}
      <button className="rounded bg-primary px-3 py-2 text-sm text-white disabled:opacity-50" disabled={busy || (needsFx && !fxRate)} onClick={() => onUpdate(item.id, { status: 'paid', ...(needsFx && fxRate ? { fxRateToBRL: fxRate } : {}) })}>Marcar como pago</button>
    </div>}
  </li>;
}

export function AgendaTimeline({ items, onUpdate, busy }: {
  items: DividendItem[]; onUpdate: (id: string, patch: { status: 'confirmed' | 'paid'; paymentDate?: string; fxRateToBRL?: string }) => Promise<void>; busy: boolean;
}) {
  const dates = [...new Set(items.map((item) => item.exDate))].sort();
  return <section aria-label="Agenda por data-com" className="space-y-5">
    {dates.map((date) => <div key={date} className="border-l-2 border-primary pl-4">
      <h2 className="mb-2 font-semibold">Data-com: {dateLabel(date)}</h2>
      <ul className="space-y-2">{items.filter((item) => item.exDate === date).sort((a, b) => (a.symbol ?? '').localeCompare(b.symbol ?? '')).map((item) =>
        <AgendaEntry key={item.id} item={item} onUpdate={onUpdate} busy={busy} />)}</ul>
    </div>)}
  </section>;
}

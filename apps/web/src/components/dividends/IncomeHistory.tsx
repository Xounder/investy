import type { IncomeHistory as History } from '@/lib/dividends';
import { kindLabels } from '@/lib/dividends';
import { dateLabel, money } from '@/lib/journal-format';

const months = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });
export function IncomeHistory({ history }: { history: History }) {
  return <section className="space-y-4">
    <div className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Renda recebida</h2><p className="text-2xl font-bold">{history.totalsIncomplete ? 'Total parcial: ' : ''}{money(history.totalCents)}</p>{history.totalsIncomplete && <p role="alert" className="text-sm text-amber-800">Total incompleto: há pagamentos legados sem recebimento conciliado. O valor exibido inclui apenas recebimentos comprovados.</p>}<p className="text-sm text-tertiary">Somente pagamentos realizados; amortizações são devoluções de capital.</p></div>
    {!history.months.length ? <div className="rounded-xl border bg-white p-8 text-center">Nenhum pagamento registrado neste período.</div> : history.months.map((month) => <div key={`${month.year}-${month.month}`} className="rounded-xl border bg-white p-4">
      <h3 className="mb-3 font-semibold capitalize">{months.format(new Date(Date.UTC(month.year, month.month - 1, 1)))} de {month.year} · {month.totalsIncomplete ? 'total parcial: ' : ''}{money(month.totalCents)}</h3>
      {month.totalsIncomplete && <p role="alert" className="mb-2 text-sm text-amber-800">Total do mês incompleto: há pagamentos pendentes de conciliação.</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th scope="col" className="p-2">Ativo</th><th scope="col" className="p-2">Tipo</th><th scope="col" className="p-2">Pagamento</th><th scope="col" className="p-2 text-right">Valor</th></tr></thead><tbody>
        {month.items.map((item) => <tr key={item.id} className="border-t"><td className="p-2">{item.symbol ?? 'Ativo não encontrado'} <span className="text-tertiary">{item.assetName ?? item.assetId}</span></td><td className="p-2">{kindLabels[item.kind]}{item.category === 'return_of_capital' && <span className="block text-amber-800">Fora da renda</span>}</td><td className="p-2">{item.paymentDate ? dateLabel(item.paymentDate) : '—'}</td><td className="p-2 text-right">{item.reconciliationRequired ? <span role="alert" className="text-amber-800">Recebimento legado não conciliado; valor não confirmado</span> : <>{money(item.amountCents, item.amountCurrency)}{item.currency !== 'BRL' && <span className="block text-xs text-tertiary">Original: {money(item.nativeAmountCents, item.currency)}</span>}</>}</td></tr>)}
      </tbody></table></div>
    </div>)}
  </section>;
}

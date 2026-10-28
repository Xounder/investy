import type { NotaPreview } from '@/lib/imports';
import { moneyCents } from '@/lib/imports';

const date = (value: string) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value)) : 'Data não informada';

export function NotaReview({ nota }: { nota: NotaPreview }) {
  const feeTotal = Object.values(nota.fees).reduce((sum, value) => sum + BigInt(value), 0n);
  const allocated = nota.rateio.reduce((sum, value) => sum + BigInt(value), 0n);
  return <section aria-label="Revisão da nota" className="space-y-4 rounded-xl border bg-white p-4 sm:p-6">
    <h2 className="text-lg font-bold">Revisar nota {nota.notaNumber || 'sem número'}</h2>
    <p>Pregão: {date(nota.tradeDate)} · {nota.items.length} registros</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm">
      <thead><tr><th scope="col">Tipo</th><th scope="col">Ativo</th><th scope="col">Quantidade</th><th scope="col">Preço unitário</th><th scope="col">Taxa rateada</th></tr></thead>
      <tbody>{nota.items.map((item, index) => <tr key={index} className="border-t">
        <td className="py-2">{item.type === 'split' ? 'Desdobramento' : item.type === 'jcp' ? 'JCP' : item.direction === 'C' ? 'Compra' : 'Venda'}{item.dayTrade ? ' · Day trade' : ''}</td>
        <td>{item.symbol}</td><td>{item.type === 'split' ? `Fator ${item.factor ?? '—'}` : new Intl.NumberFormat('pt-BR').format(BigInt(item.qty))}</td>
        <td>{moneyCents(item.unitPriceCents)}</td><td>{moneyCents(nota.rateio[index] ?? '0')}</td>
      </tr>)}</tbody>
    </table></div>
    <dl className="grid gap-2 sm:grid-cols-2">{Object.entries(nota.fees).map(([key, value]) => <div key={key} className="flex justify-between gap-4"><dt className="capitalize">{key}</dt><dd>{moneyCents(value)}</dd></div>)}
      <div className="flex justify-between gap-4 font-semibold"><dt>Total de taxas</dt><dd>{moneyCents(feeTotal.toString())}</dd></div>
      <div className="flex justify-between gap-4 font-semibold"><dt>Total rateado</dt><dd>{moneyCents(allocated.toString())}</dd></div>
    </dl>
    {nota.warnings.length > 0 && <div role="alert" className="rounded-lg bg-amber-50 p-4 text-amber-900"><h3 className="font-semibold">Conciliação pendente</h3><ul className="list-disc pl-5">{nota.warnings.map((warning, i) => <li key={i}>{warning.message}{warning.details ? ` (${warning.details})` : ''}</li>)}</ul>
      <p>Não é possível confirmar enquanto houver pendências. Corrija o arquivo original ou solicite a inclusão do ativo no catálogo e faça uma nova prévia. Notas duplicadas não devem ser reenviadas.</p>
    </div>}
  </section>;
}

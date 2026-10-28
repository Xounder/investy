import { money, quantity, dateLabel, typeLabels } from '@/lib/journal-format';
import type { JournalEvent, Asset } from '@/lib/journal';

export function JournalTable({ rows, assets }: { rows: JournalEvent[]; assets: Record<string, Asset> }) {
  return <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white"><table className="w-full min-w-[900px] text-left text-sm tabular-nums">
    <thead className="bg-gray-50 text-tertiary"><tr>{['Data', 'Tipo', 'Ativo', 'Qtd.', 'Preço unitário', 'Taxas', 'Total', 'Observações'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-gray-100"><td className="whitespace-nowrap px-4 py-3">{dateLabel(row.date)}</td><td className="px-4 py-3"><span className="rounded bg-gray-100 px-2 py-1">{typeLabels[row.type] ?? row.type}</span></td><td className="px-4 py-3">{assets[row.assetId]?.symbol ?? row.assetId}</td><td className="px-4 py-3">{quantity(row.qty)}</td><td className="px-4 py-3">{money(row.unitPriceCents, row.currency ?? assets[row.assetId]?.currency)}</td><td className="px-4 py-3">{money(row.feeCents, row.currency ?? assets[row.assetId]?.currency)}</td><td className="px-4 py-3">{money((BigInt(row.qty) * BigInt(row.unitPriceCents) + BigInt(row.feeCents)).toString(), row.currency ?? assets[row.assetId]?.currency)}</td><td className="max-w-xs truncate px-4 py-3" title={row.notes ?? ''}>{row.notes || '—'}</td></tr>)}</tbody>
  </table></div>;
}

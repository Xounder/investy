import { useNavigate, useLocation } from 'react-router-dom';
import { money, quantity, signedMoney, pnlTone, percent, dailyChange, dailyChangeTone } from '@/lib/journal-format';
import type { Holding } from '@/lib/journal';
import { useUiStore } from '@/stores/ui';

export function HoldingsTable({ rows }: { rows: Holding[] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const setPrefill = useUiStore((s) => s.setRegisterPrefill);
  function action(row: Holding, type: 'sell' | 'jcp') {
    setPrefill({ type, assetId: row.assetId, symbol: row.symbol, accountId: row.accountId, qty: row.qty, priceCents: type === 'sell' ? row.priceCents : null, isStale: row.isStale });
    navigate('/global-action', { state: { background: location } });
  }
  return <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
    <table className="w-full min-w-[1050px] text-left text-sm tabular-nums">
      <thead className="bg-gray-50 text-tertiary"><tr>{['Ativo', 'Classe', 'Qtd.', 'Preço médio', 'Custo', 'Valor de mercado', 'Dia Δ', 'P&L não realizado', '%', 'Ações'].map((heading, i) => <th key={heading} title={heading === 'Dia Δ' ? 'Variação diária da cotação na moeda do ativo; não inclui câmbio' : undefined} className={`whitespace-nowrap px-4 py-3 ${i === 0 ? 'sticky left-0 z-10 bg-gray-50' : ''}`}>{heading}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-gray-100">
        <td className="sticky left-0 z-10 bg-white px-4 py-3"><button type="button" onClick={() => navigate(`/assets/${encodeURIComponent(row.symbol)}`, { state: { background: location } })} className="font-semibold text-primary hover:underline">{row.symbol}</button><span className="block text-xs text-tertiary">{row.assetName}</span></td>
        <td className="px-4 py-3">{row.assetClass}</td><td className="px-4 py-3">{quantity(row.qty)}</td>
        <td className="px-4 py-3">{money(row.avgPriceCents, row.assetCurrency)}</td><td className="px-4 py-3">{money(row.costBasisCents)}</td>
        <td className="px-4 py-3">{money(row.marketValueCentsBRL)}{row.isStale && <span className="block text-xs text-amber-700">Cotação desatualizada</span>}</td>
        <td className={`px-4 py-3 ${dailyChangeTone(row.dayChangePercent)}`} aria-label={`Variação diária da cotação em ${row.assetCurrency}, sem câmbio: ${row.dayChangePercent == null ? 'indisponível' : dailyChange(row.dayChangePercent)}`}>{dailyChange(row.dayChangePercent)}</td>
        <td className={`px-4 py-3 font-medium ${pnlTone(row.unrealizedPnlCentsBRL)}`}>{signedMoney(row.unrealizedPnlCentsBRL)}</td>
        <td className={`px-4 py-3 ${pnlTone(row.unrealizedPnlCentsBRL)}`}>{percent(row.unrealizedPnlCentsBRL, row.costBasisCents)}</td>
        <td className="whitespace-nowrap px-4 py-3"><button type="button" className="mr-3 text-primary hover:underline" onClick={() => action(row, 'sell')}>Vender</button><button type="button" className="text-primary hover:underline" onClick={() => action(row, 'jcp')}>JCP</button></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

import { useState, type FormEvent } from 'react';
import type { Asset, Portfolio } from '@/lib/journal';
import { toCents } from '@/lib/journal-format';
import type { CreateDividend, DividendKind } from '@/lib/dividends';
import { kindLabels } from '@/lib/dividends';

const field = 'block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm';
export function CreateDividendForm({ portfolios, assets, busy, onSubmit, onCancel }: {
  portfolios: Portfolio[]; assets: Asset[]; busy: boolean;
  onSubmit: (data: CreateDividend) => Promise<void>; onCancel: () => void;
}) {
  const [portfolioId, setPortfolioId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [kind, setKind] = useState<DividendKind>('dividend');
  const [exDate, setExDate] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [rate, setRate] = useState('');
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const cents = toCents(rate);
    if (!cents || BigInt(cents) <= 0n) { setError('Informe um valor por cota maior que zero (até duas casas decimais).'); return; }
    if (paymentDate && paymentDate <= exDate) { setError('A data de pagamento deve ser posterior à data-com.'); return; }
    setError('');
    void onSubmit({ portfolioId, assetId, kind, exDate, ...(paymentDate ? { paymentDate } : {}), rateCentsPerUnit: cents });
  }
  return <form onSubmit={submit} className="space-y-3 rounded-xl border bg-white p-5" aria-label="Registrar provento">
    <h2 className="font-semibold">Registrar provento manualmente</h2>
    <p className="text-sm text-tertiary">O valor é por cota; o total depende das cotas elegíveis na data-com.</p>
    <label className="block text-sm">Carteira <select className={field} required value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)}><option value="">Selecione uma carteira</option>{portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label className="block text-sm">Ativo <select className={field} required value={assetId} onChange={(e) => setAssetId(e.target.value)}><option value="">Selecione um ativo</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.symbol} — {a.name}</option>)}</select></label>
    <label className="block text-sm">Tipo <select className={field} value={kind} onChange={(e) => setKind(e.target.value as DividendKind)}>{(Object.keys(kindLabels) as DividendKind[]).map((key) => <option key={key} value={key}>{kindLabels[key]}</option>)}</select></label>
    <label className="block text-sm">Data-com <input className={field} type="date" required value={exDate} onChange={(e) => setExDate(e.target.value)} /></label>
    <label className="block text-sm">Data de pagamento (opcional) <input className={field} type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></label>
    <label className="block text-sm">Valor por cota ({assets.find((asset) => asset.id === assetId)?.currency === 'USD' ? 'US$' : 'R$'}) <input className={field} inputMode="decimal" required placeholder="1,23" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex gap-3"><button disabled={busy} className="rounded bg-primary px-4 py-2 text-white disabled:opacity-50" type="submit">Salvar provento</button><button type="button" className="text-primary" onClick={onCancel}>Cancelar</button></div>
  </form>;
}

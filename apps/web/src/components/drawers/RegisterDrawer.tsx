import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { journalApi, errorText, isUnauthorized, type Asset } from '@/lib/journal';
import { toCents, toFxMicro, typeLabels } from '@/lib/journal-format';
import { useUiStore } from '@/stores/ui';

const types = ['buy', 'sell', 'dividend', 'jcp', 'amortizacao', 'split', 'bonificacao', 'adjustment', 'opening'] as const;
type Form = { type: string; date: string; accountId: string; qty: string; price: string; fees: string; fx: string; factor: string; notes: string };
const initial = (): Form => ({ type: 'buy', date: new Date().toISOString().slice(0, 10), accountId: '', qty: '', price: '', fees: '0', fx: '', factor: '', notes: '' });
const field = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm';

export function RegisterDrawer() {
  const navigate = useNavigate();
  const location = useLocation();
  const background = (location.state as { background?: { pathname: string } } | null)?.background;
  const afterSuccess = (location.state as { afterSuccess?: unknown } | null)?.afterSuccess;
  const prefill = useUiStore((s) => s.registerPrefill);
  const clearPrefill = useUiStore((s) => s.setRegisterPrefill);
  const setRegisterFeedback = useUiStore((s) => s.setRegisterFeedback);
  const portfolioId = useUiStore((s) => s.activePortfolioId);
  const [form, setForm] = useState<Form>(initial);
  const [search, setSearch] = useState(prefill?.symbol ?? '');
  const [asset, setAsset] = useState<Asset | null>(null);
  const [error, setError] = useState('');
  const client = useQueryClient();
  const portfolios = useQuery({ queryKey: ['portfolios'], queryFn: journalApi.portfolios });
  const [selectedPortfolio, setSelectedPortfolio] = useState(portfolioId ?? '');
  const prefillPortfolio = useQuery({
    queryKey: ['prefill-account-portfolio', prefill?.accountId],
    queryFn: async () => {
      const entries = await Promise.all((portfolios.data ?? []).map(async (p) => ({ id: p.id, accounts: await journalApi.accounts(p.id) })));
      return entries.find((entry) => entry.accounts.some((a) => a.id === prefill?.accountId))?.id;
    },
    enabled: !!prefill && !!portfolios.data?.length,
  });
  const currentPortfolio = selectedPortfolio || portfolios.data?.find((p) => p.isDefault)?.id || portfolios.data?.[0]?.id || '';
  const accounts = useQuery({ queryKey: ['accounts', currentPortfolio], queryFn: () => journalApi.accounts(currentPortfolio), enabled: !!currentPortfolio });
  const assets = useQuery({ queryKey: ['assets', search], queryFn: () => journalApi.assets(search), enabled: search.trim().length > 0 && !asset });
  const prefillAsset = useQuery({ queryKey: ['asset', prefill?.symbol], queryFn: () => journalApi.asset(prefill!.symbol), enabled: !!prefill });
  useEffect(() => {
    if (!prefill) return;
    setForm((f) => ({ ...f, type: prefill.type, accountId: prefill.accountId, qty: prefill.qty, price: prefill.priceCents ? (BigInt(prefill.priceCents) / 100n).toString() + ',' + String(BigInt(prefill.priceCents) % 100n).padStart(2, '0') : '' }));
  }, [prefill]);
  useEffect(() => { if (prefillAsset.data?.asset) setAsset(prefillAsset.data.asset); }, [prefillAsset.data]);
  useEffect(() => { if (prefillPortfolio.data) setSelectedPortfolio(prefillPortfolio.data); }, [prefillPortfolio.data]);
  useEffect(() => { if (portfolios.isError && isUnauthorized(portfolios.error)) navigate('/login', { replace: true, state: { from: '/global-action' } }); }, [portfolios.isError, portfolios.error, navigate]);

  function close() {
    clearPrefill(null);
    if (background || window.history.state?.idx > 0) navigate(-1);
    else navigate('/holdings', { replace: true });
  }
  const mutation = useMutation({
    mutationFn: journalApi.create,
    onSuccess: async () => {
      await Promise.all(['holdings', 'transactions', 'summary', 'dashboard', 'position'].map((key) => client.invalidateQueries({ queryKey: [key] })));
      setRegisterFeedback('Operação registrada com sucesso.');
      if (afterSuccess === '/') { clearPrefill(null); navigate('/', { replace: true }); }
      else close();
    },
    onError: (reason) => { if (isUnauthorized(reason)) navigate('/login', { state: { from: location.pathname } }); else setError(errorText(reason)); },
  });
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const qty = form.qty.trim();
    const price = toCents(form.price);
    const fees = form.type === 'dividend' ? '0' : toCents(form.fees);
    const monetary = !['split', 'bonificacao', 'adjustment'].includes(form.type);
    if (!asset || !accounts.data?.some((a) => a.id === form.accountId) || (prefill && prefillPortfolio.isPending)) return setError('Selecione um ativo e uma conta válidos.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || Number.isNaN(Date.parse(`${form.date}T12:00:00.000Z`)) || new Date(`${form.date}T12:00:00.000Z`).toISOString().slice(0, 10) !== form.date) return setError('Informe uma data válida.');
    if (!/^\d+$/.test(qty) || BigInt(qty) <= 0n || BigInt(qty) > 9223372036854775807n) return setError('A quantidade deve ser positiva e válida.');
    if ((monetary && (!price || BigInt(price) <= 0n)) || fees == null) return setError('Informe preço positivo e taxas válidas.');
    const fx = asset.currency === 'BRL' ? undefined : toFxMicro(form.fx);
    if (asset.currency !== 'BRL' && !fx) return setError('Informe o câmbio histórico em BRL na data da operação.');
    if (form.type === 'split' && (!/^\d+$/.test(form.factor) || Number(form.factor) <= 0 || !Number.isSafeInteger(Number(form.factor)))) return setError('Informe o fator inteiro positivo do desdobramento.');
    setError('');
    mutation.mutate({ type: form.type, date: `${form.date}T12:00:00.000Z`, assetId: asset.id, accountId: form.accountId, qty, unitPriceCents: price ?? '0', feeCents: fees, ...(fx ? { fxRateToBRL: fx } : {}), ...(form.type === 'split' ? { factor: Number(form.factor) } : {}), ...(form.type === 'amortizacao' ? { amortRateCents: price } : {}), notes: form.notes.trim() || null });
  }
  function update(key: keyof Form, value: string) { setForm((f) => ({ ...f, [key]: value })); setError(''); }
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-label="Registrar operação" className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between"><h1 className="text-xl font-bold">Registrar operação</h1><button type="button" onClick={close} aria-label="Fechar">✕</button></div>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm">Tipo<select className={field} value={form.type} onChange={(e) => { const type = e.target.value; setForm((f) => ({ ...f, type, fees: type === 'dividend' ? '0' : f.fees })); setError(''); }}>{types.map((t) => <option key={t} value={t}>{typeLabels[t]}</option>)}</select></label>
        <label className="block text-sm">Carteira<select className={field} value={currentPortfolio} onChange={(e) => { setSelectedPortfolio(e.target.value); update('accountId', ''); }}><option value="">Selecione</option>{portfolios.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="block text-sm">Conta<select className={field} value={form.accountId} onChange={(e) => update('accountId', e.target.value)}><option value="">Selecione</option>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        {accounts.isError && <p role="alert">{errorText(accounts.error)}</p>}
        <label className="block text-sm">Ativo<input className={field} value={search} placeholder="Buscar por código ou nome" onChange={(e) => { setSearch(e.target.value); setAsset(null); }} /></label>
        {asset ? <p className="text-sm text-green-700">Selecionado: {asset.symbol} — {asset.name}</p> : <div className="max-h-36 overflow-auto" role="listbox" aria-label="Resultados de ativos">{assets.isLoading && <p>Buscando ativos...</p>}{assets.data?.items.map((item) => <button className="block w-full p-2 text-left hover:bg-gray-100" type="button" role="option" aria-selected={false} key={item.id} onClick={() => { setAsset(item); setSearch(item.symbol); }}>{item.symbol} — {item.name}</button>)}{assets.data?.items.length === 0 && <p>Ativo não encontrado</p>}{assets.isError && <p role="alert">{errorText(assets.error)}</p>}</div>}
        {prefill?.isStale && <p className="text-amber-700">Cotação desatualizada; confirme o preço antes de registrar.</p>}
        <label className="block text-sm">Data<input className={field} type="date" value={form.date} onChange={(e) => update('date', e.target.value)} required /></label>
        <label className="block text-sm">Quantidade<input className={field} inputMode="numeric" value={form.qty} onChange={(e) => update('qty', e.target.value)} required /></label>
        <label className="block text-sm">{form.type === 'amortizacao' ? 'Valor amortizado por unidade' : form.type === 'jcp' ? 'JCP por unidade' : form.type === 'dividend' ? 'Dividendo por unidade' : 'Preço unitário'} ({asset?.currency ?? 'BRL'})<input className={field} inputMode="decimal" value={form.price} onChange={(e) => update('price', e.target.value)} required={!['split', 'bonificacao', 'adjustment'].includes(form.type)} /></label>
        <label className="block text-sm">Taxas<input className={field} inputMode="decimal" value={form.type === 'dividend' ? '0' : form.fees} onChange={(e) => update('fees', e.target.value)} disabled={form.type === 'dividend'} /></label>
        {asset && asset.currency !== 'BRL' && <label className="block text-sm">Câmbio histórico (BRL por {asset.currency})<input className={field} inputMode="decimal" value={form.fx} onChange={(e) => update('fx', e.target.value)} required /></label>}
        {form.type === 'split' && <label className="block text-sm">Fator de desdobramento<input className={field} inputMode="numeric" value={form.factor} onChange={(e) => update('factor', e.target.value)} required /></label>}
        <label className="block text-sm">Observações<textarea className={field} maxLength={2000} value={form.notes} onChange={(e) => update('notes', e.target.value)} /></label>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {portfolios.isError && <p role="alert">{errorText(portfolios.error)}</p>}
        <button type="submit" disabled={mutation.isPending} className="rounded-lg bg-primary px-5 py-2 text-white disabled:opacity-50">{mutation.isPending ? 'Registrando...' : 'Registrar'}</button>
      </form>
    </section>
  </div>;
}

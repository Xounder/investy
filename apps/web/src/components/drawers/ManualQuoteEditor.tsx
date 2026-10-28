import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { refreshPrices } from '@/components/settings/cache';
import { errorText } from '@/lib/journal';
import { money } from '@/lib/journal-format';
import { manualQuoteApi, parseManualPrice } from '@/lib/manual-quote';

interface Props {
  symbol: string;
  currency: string;
  override: { priceCents: string; currency: string; createdAt: string } | null;
  provider: { priceCents: string; currency: string; isStale: boolean; source?: string; priceCentsBRL?: string | null; fxUnavailable?: boolean } | null;
}

export function ManualQuoteEditor({ symbol, currency, override, provider }: Props) {
  const client = useQueryClient();
  const [price, setPrice] = useState('');
  const [validation, setValidation] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const [success, setSuccess] = useState('');
  const save = useMutation({
    mutationFn: (cents: number) => manualQuoteApi.save(symbol, cents, currency),
    onMutate: () => { setSuccess(''); setValidation(''); },
    onSuccess: async () => { await refreshPrices(client); setSuccess('Preço manual salvo.'); setPrice(''); },
  });
  const clear = useMutation({
    mutationFn: () => manualQuoteApi.clear(symbol),
    onMutate: () => setSuccess(''),
    onSuccess: async () => { await refreshPrices(client); setConfirmation(false); setSuccess('Preço manual removido.'); },
  });
  const pending = save.isPending || clear.isPending;
  function submit() {
    const cents = parseManualPrice(price);
    if (cents === null) { setValidation('Informe um preço positivo em centavos, por exemplo 1.234,56.'); return; }
    save.mutate(cents);
  }
  return <section aria-label="Preço manual" className="space-y-3 rounded-lg border p-4 text-sm">
    <h2 className="font-semibold">Preço manual</h2>
    <p>Preço manual exclusivo da sua conta; prevalece sobre a cotação do provedor até ser removido.</p>
    {override && <p className="tabular-nums">Preço manual ativo ({override.currency}): {money(override.priceCents, override.currency)}</p>}
    <p className="tabular-nums">Cotação do provedor: {provider ? money(provider.priceCents, provider.currency) : 'indisponível'}{provider?.isStale ? ' · desatualizada' : ''}</p>
    <p className="tabular-nums">Valorização em BRL da cotação do provedor: {provider?.fxUnavailable ? 'câmbio indisponível' : money(provider?.priceCentsBRL ?? null)}</p>
    {override && <p>O valor em BRL da posição é calculado pelo servidor; consulte a posição atualizada para ver a conversão do preço manual.</p>}
    <form onSubmit={(event) => { event.preventDefault(); if (!pending) submit(); }} className="space-y-2">
      <label className="block" htmlFor="manual-quote-price">Preço por unidade ({currency})</label>
      <input id="manual-quote-price" inputMode="decimal" autoComplete="off" value={price} onChange={(event) => { setPrice(event.target.value); setValidation(''); }} className="w-full rounded border p-2" placeholder="0,00" aria-invalid={!!validation} />
      {validation && <p role="alert" className="text-red-700">{validation}</p>}
      <button disabled={pending} className="rounded bg-primary px-4 py-2 text-white disabled:opacity-50" type="submit">{save.isPending ? 'Salvando…' : override ? 'Atualizar preço manual' : 'Salvar preço manual'}</button>
    </form>
    {override && <div><button type="button" disabled={pending} className="text-red-700 underline" onClick={() => setConfirmation(true)}>Remover preço manual</button>
      {confirmation && <div className="mt-2 rounded border border-red-200 p-3">Remover o preço manual de {symbol} e voltar à cotação do provedor?
        <div className="mt-2 flex gap-3"><button type="button" disabled={pending} onClick={() => clear.mutate()} className="text-red-700 underline">Confirmar remoção</button><button type="button" disabled={pending} onClick={() => setConfirmation(false)}>Cancelar</button></div>
      </div>}
    </div>}
    {(save.error || clear.error) && <div role="alert">{errorText(save.error ?? clear.error)} <button type="button" className="text-primary underline" disabled={pending} onClick={() => { if (clear.error) { setConfirmation(true); clear.mutate(); } else submit(); }}>Tentar novamente</button></div>}
    {success && <p role="status" className="text-green-700">{success}</p>}
  </section>;
}

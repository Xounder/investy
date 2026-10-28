import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi, type Account } from '@/lib/settings';
import { Section, QueryState, MutationFeedback, inputClass, buttonClass, secondaryClass, useSessionError } from './common';
import { ErrorCard } from '@/components/ui/ErrorCard';
import { refreshAccounts } from './cache';

export function BrokersSection() {
  const client = useQueryClient();
  const portfolios = useQuery({ queryKey: ['settings', 'portfolios'], queryFn: settingsApi.portfolios });
  const brokers = useQuery({ queryKey: ['settings', 'brokers'], queryFn: settingsApi.brokers });
  const accountQueries = useQueries({ queries: (portfolios.data ?? []).map((p) => ({ queryKey: ['settings', 'accounts', p.id], queryFn: () => settingsApi.accounts(p.id) })) });
  const accountError = accountQueries.find((q) => q.error)?.error;
  useSessionError(accountError);
  const [brokerName, setBrokerName] = useState('');
  const [code, setCode] = useState('');
  const [url, setUrl] = useState('');
  const [portfolioId, setPortfolioId] = useState('');
  const [brokerId, setBrokerId] = useState('');
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [lastAction, setLastAction] = useState<'broker' | 'create' | 'update' | 'remove' | null>(null);
  const addBroker = useMutation({ mutationFn: settingsApi.createBroker, onMutate: () => setSuccess(''), onSuccess: async () => { setBrokerName(''); setCode(''); setUrl(''); setSuccess('Corretora criada.'); await client.invalidateQueries({ queryKey: ['settings', 'brokers'] }); } });
  const create = useMutation({ mutationFn: settingsApi.createAccount, onMutate: () => setSuccess(''), onSuccess: async () => { setName(''); setNumber(''); setSuccess('Conta criada.'); await refreshAccounts(client); } });
  const update = useMutation({ mutationFn: ({ id, name: accountName, accountNumber }: { id: string; name: string; accountNumber: string | null }) => settingsApi.updateAccount(id, { name: accountName, accountNumber }), onMutate: () => setSuccess(''), onSuccess: async () => { setEditing(null); setName(''); setNumber(''); setSuccess('Conta atualizada.'); await refreshAccounts(client); } });
  const remove = useMutation({ mutationFn: settingsApi.deleteAccount, onMutate: () => setSuccess(''), onSuccess: async () => { setConfirm(null); setSuccess('Conta excluída.'); await refreshAccounts(client); } });
  const busy = addBroker.isPending || create.isPending || update.isPending || remove.isPending;
  const makeBroker = () => { if (brokerName.trim() && !busy) { setLastAction('broker'); addBroker.mutate({ name: brokerName.trim(), ...(code.trim() ? { code: code.trim() } : {}), ...(url.trim() ? { url: url.trim() } : {}) }); } };
  const saveAccount = () => { if (busy || !name.trim() || !portfolioId || !brokerId) return; if (editing) { setLastAction('update'); update.mutate({ id: editing, name: name.trim(), accountNumber: number.trim() || null }); } else { setLastAction('create'); create.mutate({ portfolioId, brokerId, name: name.trim(), accountNumber: number.trim() || null }); } };
  const erase = (id: string) => { if (!busy && confirm === id) { setLastAction('remove'); remove.mutate(id); } };
  const error = lastAction === 'broker' ? addBroker.error : lastAction === 'create' ? create.error : lastAction === 'update' ? update.error : lastAction === 'remove' ? remove.error : null;
  const retry = () => { if (lastAction === 'broker') makeBroker(); else if (lastAction === 'remove' && remove.variables) erase(remove.variables); else if (lastAction === 'create' || lastAction === 'update') saveAccount(); };
  const accounts = accountQueries.flatMap((q) => q.data ?? []);
  const edit = (account: Account) => { setEditing(account.id); setConfirm(null); setPortfolioId(account.portfolioId); setBrokerId(account.brokerId); setName(account.name); setNumber(account.accountNumber ?? ''); };
  return <Section title="Corretoras e contas">
    <QueryState pending={brokers.isPending || portfolios.isPending} error={brokers.error ?? portfolios.error} retry={() => { void brokers.refetch(); void portfolios.refetch(); }} />
    {brokers.data && <><h3 className="font-medium">Corretoras disponíveis</h3>{!brokers.data.length && <p className="mt-2 text-sm text-tertiary">Nenhuma corretora disponível. Cadastre sua primeira corretora abaixo.</p>}<ul className="mt-2 flex flex-wrap gap-2">{brokers.data.map((b) => <li key={b.id} className="rounded-lg border px-3 py-2 text-sm">{b.name} {b.code && `(${b.code})`} <span className="text-tertiary">· {b.isSeeded ? 'Catálogo' : 'Personalizada'}</span></li>)}</ul>
      <form className="mt-4 grid gap-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); makeBroker(); }}>
        <label className="text-sm">Nova corretora<input className={inputClass} required maxLength={120} value={brokerName} onChange={(e) => setBrokerName(e.target.value)} /></label>
        <label className="text-sm">Código (opcional)<input className={inputClass} maxLength={40} value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <label className="text-sm">URL (opcional)<input className={inputClass} type="url" maxLength={255} value={url} onChange={(e) => setUrl(e.target.value)} /></label>
        <button className={buttonClass} disabled={busy || !brokerName.trim()}>{addBroker.isPending ? 'Criando…' : 'Adicionar corretora'}</button>
      </form></>}
    <h3 className="mt-6 font-medium">Contas</h3>
    {accountQueries.some((q) => q.isPending) && <QueryState pending error={null} retry={() => {}} />}
    {accountError && <ErrorCard message="Não foi possível carregar as contas." onRetry={() => { accountQueries.forEach((q) => { if (q.isError) void q.refetch(); }); }} />}
    {!accountQueries.some((q) => q.isPending || q.isError) && !accounts.length && <p className="mt-2 text-sm text-tertiary">Nenhuma conta. Adicione uma conta abaixo.</p>}
    <ul className="divide-y">{accounts.map((a) => <li className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" key={a.id}>
      <span>{a.name} · {brokers.data?.find((b) => b.id === a.brokerId)?.name ?? 'Corretora'} · {portfolios.data?.find((p) => p.id === a.portfolioId)?.name ?? 'Carteira'}{a.accountNumber && ` · ${a.accountNumber}`}</span>
      <span><button className={secondaryClass} disabled={busy} onClick={() => edit(a)}>Editar</button> <button className={secondaryClass} disabled={busy} onClick={() => { setConfirm(a.id); setEditing(null); }}>Excluir</button></span>
      {confirm === a.id && <div className="w-full rounded border border-red-200 p-3">Excluir esta conta? Contas com operações não podem ser excluídas. <button className={secondaryClass} disabled={busy} onClick={() => erase(a.id)}>Confirmar exclusão</button> <button className={secondaryClass} onClick={() => setConfirm(null)}>Cancelar</button></div>}
    </li>)}</ul>
    {portfolios.data && brokers.data && <form className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); saveAccount(); }}>
      <label className="text-sm">Carteira<select className={inputClass} value={portfolioId} required disabled={!!editing} onChange={(e) => setPortfolioId(e.target.value)}><option value="">Selecione</option>{portfolios.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="text-sm">Corretora<select className={inputClass} value={brokerId} required disabled={!!editing} onChange={(e) => setBrokerId(e.target.value)}><option value="">Selecione</option>{brokers.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="text-sm">Nome da conta<input className={inputClass} required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="text-sm">Número (opcional)<input className={inputClass} maxLength={60} value={number} onChange={(e) => setNumber(e.target.value)} /></label>
      <div><button className={buttonClass} disabled={busy || !name.trim() || !portfolioId || !brokerId}>{busy ? 'Aguarde…' : editing ? 'Salvar conta' : 'Adicionar conta'}</button> {editing && <button type="button" className={secondaryClass} onClick={() => { setEditing(null); setName(''); setNumber(''); }}>Cancelar</button>}</div>
    </form>}
    <MutationFeedback error={error} success={success} onRetry={retry} pending={busy || (lastAction === 'remove' && confirm !== remove.variables) || (lastAction === 'broker' ? !brokerName.trim() : lastAction !== 'remove' && (!name.trim() || !portfolioId || !brokerId))} />
  </Section>;
}

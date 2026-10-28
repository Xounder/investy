import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi, type Portfolio } from '@/lib/settings';
import { useUiStore } from '@/stores/ui';
import { Section, QueryState, MutationFeedback, inputClass, buttonClass, secondaryClass } from './common';

export function PortfoliosSection() {
  const client = useQueryClient();
  const setActive = useUiStore((s) => s.setActivePortfolioId);
  const active = useUiStore((s) => s.activePortfolioId);
  const query = useQuery({ queryKey: ['settings', 'portfolios'], queryFn: settingsApi.portfolios });
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [lastAction, setLastAction] = useState<'create' | 'update' | 'remove' | null>(null);
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['settings', 'portfolios'] }), client.invalidateQueries({ queryKey: ['portfolios'] })]); };
  const create = useMutation({ mutationFn: settingsApi.createPortfolio, onMutate: () => setSuccess(''), onSuccess: async () => { setName(''); setSuccess('Carteira criada.'); await refresh(); } });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: { name?: string; isDefault?: boolean } }) => settingsApi.updatePortfolio(id, body), onMutate: () => setSuccess(''), onSuccess: async () => { setEditing(null); setSuccess('Carteira atualizada.'); await refresh(); } });
  const remove = useMutation({ mutationFn: settingsApi.deletePortfolio, onMutate: () => setSuccess(''), onSuccess: async (_, id) => { setConfirm(null); if (active === id) setActive(null); setSuccess('Carteira excluída.'); await refresh(); } });
  const busy = create.isPending || update.isPending || remove.isPending;
  const make = (value: string) => { if (value.trim() && !busy) { setLastAction('create'); create.mutate(value.trim()); } };
  const change = (value: { id: string; body: { name?: string; isDefault?: boolean } }) => { if (!busy) { setLastAction('update'); update.mutate(value); } };
  const erase = (id: string) => { if (confirm === id && !busy) { setLastAction('remove'); remove.mutate(id); } };
  const error = lastAction === 'create' ? create.error : lastAction === 'update' ? update.error : lastAction === 'remove' ? remove.error : null;
  const retry = () => { if (lastAction === 'create' && name.trim()) make(name); else if (lastAction === 'update' && update.variables && (!update.variables.body.name || name.trim())) change(update.variables.body.name ? { ...update.variables, body: { name: name.trim() } } : update.variables); else if (lastAction === 'remove' && remove.variables) erase(remove.variables); };
  return <Section title="Carteiras">
    <QueryState pending={query.isPending} error={query.error} retry={() => { void query.refetch(); }} />
    {query.data && <>
      {!query.data.length && <p className="text-sm text-tertiary">Nenhuma carteira. Crie sua primeira carteira abaixo.</p>}
      <ul className="divide-y divide-gray-100">{query.data.map((p: Portfolio) => <li key={p.id} className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><span>{p.name} {p.isDefault && <span className="rounded bg-blue-50 px-2 py-1 text-xs text-primary">Padrão</span>}</span>
          <div className="flex flex-wrap gap-2">
            {!p.isDefault && <button className={secondaryClass} disabled={busy} onClick={() => change({ id: p.id, body: { isDefault: true } })}>Definir padrão</button>}
            <button className={secondaryClass} disabled={busy} onClick={() => { setEditing(p.id); setName(p.name); setConfirm(null); }}>Editar</button>
            <button className={secondaryClass} disabled={busy} onClick={() => { setConfirm(p.id); setEditing(null); setName(''); }}>Excluir</button>
          </div></div>
        {confirm === p.id && <div className="mt-2 rounded border border-red-200 p-3 text-sm"><p>Excluir a carteira “{p.name}”? Carteiras com posições ou operações não podem ser excluídas.</p><button className={secondaryClass} disabled={busy} onClick={() => erase(p.id)}>Confirmar exclusão</button> <button className={secondaryClass} onClick={() => setConfirm(null)}>Cancelar</button></div>}
      </li>)}</ul>
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (editing) change({ id: editing, body: { name: name.trim() } }); else make(name); }}>
        <label className="flex-1 text-sm">Nome da carteira<input className={inputClass} value={name} required maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        <button className={buttonClass} disabled={busy || !name.trim()}>{busy ? 'Aguarde…' : editing ? 'Salvar carteira' : 'Criar carteira'}</button>
        {editing && <button type="button" className={secondaryClass} onClick={() => { setEditing(null); setName(''); }}>Cancelar</button>}
      </form>
      <MutationFeedback error={error} success={success} onRetry={retry} pending={busy || (lastAction === 'remove' && confirm !== remove.variables)} />
    </>}
  </Section>;
}

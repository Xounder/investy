import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { downloadExport, settingsApi } from '@/lib/settings';
import { useUiStore } from '@/stores/ui';
import { Section, QueryState, MutationFeedback, inputClass, buttonClass, secondaryClass } from './common';
import { refreshPrices } from './cache';

export function ExportSection() {
  const exportFile = useMutation({ mutationFn: downloadExport });
  const [format, setFormat] = useState<'json' | 'csv' | null>(null);
  return <div id="exportar-dados" className="scroll-mt-6"><Section title="Exportar dados"><p className="mb-3 text-sm text-tertiary">Baixe uma cópia dos seus dados. CSV é entregue em arquivo ZIP.</p>
    <div className="flex gap-2">{(['json', 'csv'] as const).map((f) => <button key={f} className={buttonClass} disabled={exportFile.isPending} onClick={() => { setFormat(f); exportFile.mutate(f); }}>Exportar {f.toUpperCase()}</button>)}</div>
    <MutationFeedback error={exportFile.error} success={exportFile.isSuccess ? `Exportação ${format?.toUpperCase()} iniciada.` : undefined} onRetry={format ? () => exportFile.mutate(format) : undefined} pending={exportFile.isPending} />
  </Section></div>;
}

export function BackupSection() {
  const query = useQuery({ queryKey: ['settings', 'backups'], queryFn: settingsApi.backups });
  const labels = { not_configured: 'Não configurado', running: 'Em andamento', interrupted: 'Interrompido', failed: 'Falhou', verified: 'Verificado', unavailable: 'Arquivo indisponível' };
  const artifactUnavailable = query.data?.reason === 'artifact_missing_or_corrupt' || query.data?.status === 'unavailable' || query.data?.workerStatus === 'unavailable';
  return <Section title="Backups"><QueryState pending={query.isPending} error={query.error} retry={() => { void query.refetch(); }} />
    {query.data && <div className="space-y-2 text-sm"><p>Status: <strong>{artifactUnavailable && query.data.status === 'verified' ? labels.unavailable : labels[query.data.status]}</strong></p>
      <p>Último backup verificado: {artifactUnavailable ? 'Arquivo indisponível' : query.data.lastBackup?.verifiedAt ? new Date(query.data.lastBackup.verifiedAt).toLocaleString('pt-BR') : 'Nenhum backup verificado registrado'}</p>
      {artifactUnavailable && <p role="alert" className="text-red-700">O arquivo de backup está ausente ou corrompido. Não há cópia verificada acessível para restauração; não considere seus dados protegidos por este backup.</p>}
      {(query.data.status === 'interrupted' || query.data.status === 'failed') && <p role="alert" className="text-red-700">O último backup não foi concluído. Seus dados podem não estar protegidos.</p>}
      {query.data.lastBackup?.bytes && <p>Tamanho verificado: {query.data.lastBackup.bytes} bytes</p>}
      <p className="text-tertiary">{query.data.retentionNote}</p></div>}
  </Section>;
}

export function OverridesSection() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['settings', 'overrides'], queryFn: settingsApi.overrides });
  const [confirm, setConfirm] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const clear = useMutation({ mutationFn: async (symbols: string[]) => {
    for (const symbol of symbols) await settingsApi.clearOverride(symbol);
  }, onMutate: () => setSuccess(''), onSettled: async () => { await refreshPrices(client); }, onSuccess: () => { setConfirm(null); setSuccess('Preço manual removido.'); } });
  const rows = query.data ?? [];
  const retry = () => {
    if (!clear.variables || clear.isPending) return;
    if (confirm === 'all' && rows.length && rows.every((row) => clear.variables.includes(row.symbol))) clear.mutate(rows.map((row) => row.symbol));
    else if (clear.variables.length === 1 && rows.some((row) => row.assetId === confirm && row.symbol === clear.variables[0])) clear.mutate(clear.variables);
  };
  return <Section title="Preços manuais"><QueryState pending={query.isPending} error={query.error} retry={() => { void query.refetch(); }} />
    {query.data && (!rows.length ? <p className="text-sm text-tertiary">Nenhum preço manual cadastrado.</p> : <>
      <ul className="divide-y">{rows.map((item) => <li key={item.assetId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
        <span>{item.symbol} · {item.assetName} · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: item.currency }).format(Number(item.priceCents) / 100)}</span>
        <button className={secondaryClass} disabled={clear.isPending} onClick={() => setConfirm(item.assetId)}>Remover</button>
        {confirm === item.assetId && <div className="w-full rounded border border-red-200 p-2">Remover preço manual de {item.symbol}? <button className={secondaryClass} disabled={clear.isPending} onClick={() => clear.mutate([item.symbol])}>Confirmar</button> <button className={secondaryClass} onClick={() => setConfirm(null)}>Cancelar</button></div>}
      </li>)}</ul>
      <button className={secondaryClass} disabled={clear.isPending} onClick={() => setConfirm('all')}>Remover todos</button>
      {confirm === 'all' && <div className="mt-2 rounded border border-red-200 p-3 text-sm">Remover todos os preços manuais? <button className={secondaryClass} disabled={clear.isPending} onClick={() => clear.mutate(rows.map((item) => item.symbol))}>Confirmar remoção</button> <button className={secondaryClass} onClick={() => setConfirm(null)}>Cancelar</button></div>}
    </>)}<MutationFeedback error={clear.error} success={success} onRetry={retry} pending={clear.isPending || !(confirm === 'all' || rows.some((row) => row.assetId === confirm))} />
  </Section>;
}

export function DangerZone() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const setActive = useUiStore((s) => s.setActivePortfolioId);
  const profile = useQuery({ queryKey: ['settings', 'profile'], queryFn: settingsApi.profile, retry: false });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const erase = useMutation({ mutationFn: ({ email: address, password: secret }: { email: string; password: string }) => settingsApi.erase(address, secret), onSuccess: () => { client.clear(); setActive(null); useUiStore.getState().setRegisterPrefill(null); useUiStore.getState().setRegisterFeedback(null); navigate('/login', { replace: true }); } });
  const canErase = !!profile.data && email === profile.data.email && !!password && confirmed && !erase.isPending;
  const submit = () => { if (canErase) erase.mutate({ email, password }); };
  return <Section title="Zona de perigo" danger><QueryState pending={profile.isPending} error={profile.error} retry={() => { void profile.refetch(); }} />
    {profile.data && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <p className="text-sm text-red-700">Apagar conta e todos os dados permanentemente. Esta ação não pode ser desfeita.</p>
      <label className="block text-sm">Digite seu e-mail exatamente: {profile.data.email}<input className={inputClass} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="block text-sm">Senha atual<input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Confirmo que quero apagar minha conta e meus dados.</label>
      <button className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!canErase}>{erase.isPending ? 'Apagando…' : 'Apagar conta definitivamente'}</button>
      <MutationFeedback error={erase.error} onRetry={submit} pending={!canErase} />
    </form>}
  </Section>;
}

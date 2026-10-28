import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/lib/settings';
import { Section, QueryState, MutationFeedback, inputClass, buttonClass } from './common';

export function ProfileSection() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['settings', 'profile'], queryFn: settingsApi.profile, retry: false });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  useEffect(() => { if (query.data) { setName(query.data.name ?? ''); setEmail(query.data.email); } }, [query.data]);
  const save = useMutation({ mutationFn: settingsApi.updateProfile, onSuccess: (user) => client.setQueryData(['settings', 'profile'], user) });
  const valid = !!name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const submit = () => { if (valid && !save.isPending) save.mutate({ name: name.trim(), email: email.trim() }); };
  return <Section title="Perfil">
    <QueryState pending={query.isPending} error={query.error} retry={() => { void query.refetch(); }} />
    {query.data && <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <label className="text-sm">Nome<input className={inputClass} value={name} maxLength={120} required onChange={(e) => setName(e.target.value)} /></label>
      <label className="text-sm">E-mail<input className={inputClass} type="email" value={email} maxLength={255} required onChange={(e) => setEmail(e.target.value)} /></label>
      <div className="sm:col-span-2"><button className={buttonClass} disabled={save.isPending || !valid}>{save.isPending ? 'Salvando…' : 'Salvar perfil'}</button>
        <MutationFeedback error={save.error} success={save.isSuccess ? 'Perfil atualizado.' : undefined} onRetry={valid ? submit : undefined} pending={save.isPending} />
      </div>
    </form>}
  </Section>;
}

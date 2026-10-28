import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { authError, clearOwnerState } from '@/lib/auth';
import { isUnauthorized, journalApi } from '@/lib/journal';
import { settingsApi } from '@/lib/settings';
import { useUiStore } from '@/stores/ui';

export default function OnboardingPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const setActive = useUiStore((state) => state.setActivePortfolioId);
  const [portfolioName, setPortfolioName] = useState('Minha Carteira');
  const [brokerId, setBrokerId] = useState('');
  const [customBroker, setCustomBroker] = useState(false);
  const [brokerName, setBrokerName] = useState('');
  const [brokerCode, setBrokerCode] = useState('');
  const [accountName, setAccountName] = useState('Conta Principal');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const portfolios = useQuery({ queryKey: ['portfolios'], queryFn: journalApi.portfolios, retry: false });
  const brokers = useQuery({ queryKey: ['settings', 'brokers'], queryFn: settingsApi.brokers, retry: false });
  const portfolio = portfolios.data?.find((item) => item.isDefault) ?? portfolios.data?.[0];
  const accounts = useQuery({ queryKey: ['accounts', portfolio?.id], queryFn: () => settingsApi.accounts(portfolio!.id), enabled: !!portfolio, retry: false });
  const ready = !!portfolio && !!accounts.data?.length;
  useEffect(() => {
    if (![portfolios.error, brokers.error, accounts.error].some(isUnauthorized)) return;
    navigate('/login', { replace: true, state: { from: '/onboarding' } });
    void clearOwnerState(client);
  }, [portfolios.error, brokers.error, accounts.error, navigate, client]);

  async function configure(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if ((customBroker ? !brokerName.trim() : !brokerId || !brokers.data?.some((broker) => broker.id === brokerId)) || !accountName.trim() || (!portfolio && !portfolioName.trim())) {
      setError('Informe uma carteira, escolha uma corretora e dê um nome à conta.'); return;
    }
    setSaving(true); setError('');
    try {
      // The API owns creation and reuse atomically. Never create a second
      // default portfolio when an owned portfolio already exists.
      const result = await api.post<{ portfolioId: string; accountId: string }>('/v1/onboarding', {
        ...(portfolio ? { portfolioId: portfolio.id } : { portfolioName: portfolioName.trim() }),
        ...(customBroker ? { brokerName: brokerName.trim(), ...(brokerCode.trim() ? { brokerCode: brokerCode.trim() } : {}) } : { brokerId }),
        accountName: accountName.trim(),
      });
      const id = result.portfolioId;
      if (!id) throw new Error('A carteira não foi confirmada.');
      setActive(id);
      await Promise.all([client.invalidateQueries({ queryKey: ['portfolios'] }), client.invalidateQueries({ queryKey: ['accounts'] }), client.invalidateQueries({ queryKey: ['settings', 'portfolios'] }), client.invalidateQueries({ queryKey: ['settings', 'accounts'] })]);
    } catch (reason) { setError(authError(reason)); }
    finally { setSaving(false); }
  }

  return <main className="mx-auto max-w-lg space-y-5 p-6">
    <h1 className="font-display text-2xl font-bold text-primary">Configure sua carteira</h1>
    <p>Seus dados são salvos na sua conta e ficam disponíveis em outros dispositivos.</p>
    {(portfolios.isPending || brokers.isPending || (!!portfolio && accounts.isPending)) && <p role="status">Carregando sua conta…</p>}
    {portfolios.isError || brokers.isError || accounts.isError ? <div role="alert">Não foi possível carregar os dados da sua conta. <button type="button" className="text-primary underline" onClick={() => { void portfolios.refetch(); void brokers.refetch(); void accounts.refetch(); }}>Tentar novamente</button></div> : null}
    {!portfolios.isPending && !brokers.isPending && !portfolios.isError && !brokers.isError && (!portfolio || !accounts.isPending) && !accounts.isError && (ready ? <section className="space-y-4 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">Carteira e conta prontas</h2>
      <p>{portfolio.name} · {accounts.data?.[0]?.name}. Para registrar sua primeira compra, use o mesmo formulário de operações da carteira. Esta etapa é opcional.</p>
      <button type="button" className="rounded bg-primary px-4 py-2 text-white" onClick={() => { setActive(portfolio.id); navigate('/global-action', { state: { afterSuccess: '/' } }); }}>Registrar primeira compra</button>
      <button type="button" className="ml-3 text-primary underline" onClick={() => navigate('/', { replace: true })}>Ir ao dashboard</button>
    </section> : <form onSubmit={(event) => void configure(event)} className="space-y-4 rounded-xl border bg-white p-5">
      {portfolio ? <p>Continuar a configuração da carteira {portfolio.name} sem criar outra.</p> : <label className="block">Nome da carteira<input required maxLength={120} value={portfolioName} onChange={(event) => setPortfolioName(event.target.value)} className="mt-1 w-full rounded border p-2" /></label>}
      <label className="block">Corretora<select value={customBroker ? 'custom' : brokerId} onChange={(event) => { setCustomBroker(event.target.value === 'custom'); setBrokerId(event.target.value === 'custom' ? '' : event.target.value); }} className="mt-1 w-full rounded border p-2"><option value="">Selecione uma corretora</option>{brokers.data?.map((broker) => <option key={broker.id} value={broker.id}>{broker.name}</option>)}<option value="custom">Outra corretora (cadastrar)</option></select></label>
      {customBroker && <><label className="block">Nome da nova corretora<input required maxLength={120} value={brokerName} onChange={(event) => setBrokerName(event.target.value)} className="mt-1 w-full rounded border p-2" /></label><label className="block">Código da corretora (opcional)<input maxLength={40} value={brokerCode} onChange={(event) => setBrokerCode(event.target.value)} className="mt-1 w-full rounded border p-2" /></label></>}
      <label className="block">Nome da conta<input required maxLength={120} value={accountName} onChange={(event) => setAccountName(event.target.value)} className="mt-1 w-full rounded border p-2" /></label>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button type="submit" disabled={saving} className="rounded bg-primary px-4 py-2 text-white disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar carteira e conta'}</button>
    </form>)}
  </main>;
}

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { NotaReview } from '@/components/imports/NotaReview';
import { journalApi } from '@/lib/journal';
import { settingsApi } from '@/lib/settings';
import { affectedImportKeys, importApi, importError, notaHistoryStatus, type ImportResult, type NotaPreview } from '@/lib/imports';

const field = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white p-2 text-sm';
export default function TransactionsImportNotaPage() {
  const client = useQueryClient();
  const portfolios = useQuery({ queryKey: ['portfolios'], queryFn: journalApi.portfolios });
  const accounts = useQuery({ queryKey: ['import-accounts', portfolios.data?.map((p) => p.id)],
    queryFn: async () => (await Promise.all((portfolios.data ?? []).map((p) => settingsApi.accounts(p.id)))).flat(),
    enabled: !!portfolios.data?.length });
  const brokers = useQuery({ queryKey: ['settings', 'brokers'], queryFn: settingsApi.brokers });
  const history = useQuery({ queryKey: ['nota-history'], queryFn: importApi.history });
  const catalog = useQuery({ queryKey: ['asset-catalog'], queryFn: journalApi.catalog,
    enabled: false });
  const [accountId, setAccountId] = useState('');
  const [brokerId, setBrokerId] = useState('');
  const [format, setFormat] = useState<'file' | 'text'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<NotaPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'preview' | 'confirm' | null>(null);
  const generation = useRef(0);
  const lock = useRef(false);

  function discard() { generation.current++; setPreview(null); setResult(null); setError(''); }
  const account = accounts.data?.find((a) => a.id === accountId && a.brokerId === brokerId);
  async function requestPreview(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    discard();
    if (!account) { setError('Selecione uma conta e sua corretora.'); return; }
    const source = format === 'text' ? new File([text], 'nota.txt', { type: 'text/plain' }) : file;
    if (!source || !source.size || source.size > 5_000_000 || !/\.(pdf|txt|csv|xml)$/i.test(source.name)) {
      setError('Selecione PDF com texto, TXT, CSV ou XML não vazio de até 5 MB. PDFs digitalizados não são suportados.'); return;
    }
    const request = generation.current;
    lock.current = true; setBusy('preview');
    try {
      const response = await importApi.preview(source, accountId, brokerId);
      if (request === generation.current) setPreview(response.nota);
    } catch (reason) { if (request === generation.current) setError(importError(reason)); }
    finally { lock.current = false; setBusy(null); }
  }
  async function confirm() {
    if (!preview || preview.warnings.length || lock.current || !account || preview.brokerId !== brokerId) return;
    const request = generation.current;
    const token = preview.importToken;
    lock.current = true; setBusy('confirm'); setError(''); setPreview(null);
    try {
      const response = await importApi.confirm(token);
      if (request === generation.current) {
        setResult(response);
        await Promise.all(affectedImportKeys.map((key) => client.invalidateQueries({ queryKey: [key] })));
        if (response.holdings?.some(Boolean)) void catalog.refetch();
      }
    } catch (reason) {
      if (request === generation.current) setError(`${importError(reason)}. Faça uma nova prévia para tentar novamente; o token anterior não pode ser reutilizado.`);
    } finally { lock.current = false; setBusy(null); }
  }
  return <div className="space-y-6">
    <h1 className="font-display text-2xl font-bold">Importar nota de corretagem</h1>
    <nav className="flex flex-wrap gap-4 text-primary"><Link to="/transactions">Transações</Link><Link to="/transactions/import">Importar CSV de transações</Link></nav>
    <form onSubmit={(event) => void requestPreview(event)} className="space-y-4 rounded-xl border bg-white p-4 sm:p-6">
      <h2 className="text-lg font-bold">Enviar nota B3</h2>
      <p className="text-sm">PDF com texto selecionável, TXT, CSV de nota ou XML até 5 MB; até 200 registros. PDF digitalizado ou estrutura financeira não reconhecida exige um arquivo com texto legível. A importação só ocorre após revisão e confirmação.</p>
      {(portfolios.isPending || brokers.isPending || accounts.isPending && !!portfolios.data?.length) && <p role="status">Carregando contas e corretoras...</p>}
      {(portfolios.isError || brokers.isError || accounts.isError) && <p role="alert">{importError(portfolios.error ?? brokers.error ?? accounts.error)} <button type="button" className="text-primary" onClick={() => { void portfolios.refetch(); void accounts.refetch(); void brokers.refetch(); }}>Tentar novamente</button></p>}
      {!portfolios.isPending && !accounts.isPending && !accounts.data?.length && <p>Nenhuma conta disponível. <Link className="text-primary underline" to="/settings">Crie uma conta e corretora em Configurações</Link>.</p>}
      <label className="block text-sm">Corretora<select disabled={busy === 'confirm'} className={field} value={brokerId} onChange={(e) => { discard(); setBrokerId(e.target.value); setAccountId(''); }}><option value="">Selecione a corretora</option>{brokers.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <label className="block text-sm">Conta<select disabled={busy === 'confirm'} className={field} value={accountId} onChange={(e) => { discard(); setAccountId(e.target.value); }}><option value="">Selecione a conta</option>{accounts.data?.filter((a) => a.brokerId === brokerId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <fieldset disabled={busy === 'confirm'} className="flex gap-4"><legend className="text-sm">Origem da nota</legend><label><input type="radio" name="nota-format" checked={format === 'file'} onChange={() => { discard(); setFormat('file'); }} /> Arquivo</label><label><input type="radio" name="nota-format" checked={format === 'text'} onChange={() => { discard(); setFormat('text'); }} /> Colar texto</label></fieldset>
      {format === 'file' ? <label className="block text-sm">Arquivo da nota<input disabled={busy === 'confirm'} className={field} type="file" accept=".pdf,.txt,.csv,.xml,application/pdf,text/plain,text/csv,application/xml" onChange={(e) => { discard(); setFile(e.target.files?.[0] ?? null); }} />{file && <span>Selecionado: {file.name}</span>}</label>
        : <label className="block text-sm">Texto da nota<textarea disabled={busy === 'confirm'} className={field} rows={8} value={text} onChange={(e) => { discard(); setText(e.target.value); }} placeholder={'Corretora: Exemplo\nNúmero Nota: 123\nData Pregão: 15/01/2026\nC PETR4 1 25,00'} /></label>}
      <button type="submit" disabled={!!busy || !account || (format === 'file' ? !file : !text.trim())} className="rounded-lg bg-primary px-5 py-2 text-white disabled:opacity-50">{busy === 'preview' ? 'Preparando prévia...' : 'Visualizar nota'}</button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {result && <div role="status" className="space-y-2 text-green-700"><p>{result.created} registros importados. <Link className="underline" to="/transactions">Ver transações</Link> · <Link className="underline" to="/holdings">Ver posições</Link></p>
        {result.holdings && <div><h3 className="font-semibold">Posições após a importação ({result.holdings.length} recalculadas)</h3>
          {catalog.isFetching && <p>Identificando ativos...</p>}
          {catalog.isError && <p>Não foi possível carregar os nomes dos ativos; consulte suas posições.</p>}
          <ul className="list-disc pl-5">{result.holdings.map((holding, index) => <li key={holding?.id ?? index}>{holding
            ? `${catalog.data?.find((asset) => asset.id === holding.assetId)?.symbol ?? `Ativo ${holding.assetId}`} · Conta ${accounts.data?.find((a) => a.id === holding.accountId)?.name ?? holding.accountId} · Saldo ${new Intl.NumberFormat('pt-BR').format(BigInt(holding.qty))} unidades`
            : 'Posição não retornada; consulte suas posições.'}</li>)}</ul>
        </div>}
      </div>}
    </form>
    {preview && <><NotaReview nota={preview} /><button type="button" disabled={!!busy || !!preview.warnings.length || !account} onClick={() => void confirm()} className="rounded-lg bg-primary px-5 py-2 text-white disabled:opacity-50">{busy === 'confirm' ? 'Confirmando...' : 'Confirmar importação'}</button></>}
    <section className="space-y-3 rounded-xl border bg-white p-4 sm:p-6"><h2 className="text-lg font-bold">Histórico de notas</h2>
      {history.isPending ? <p role="status">Carregando histórico...</p> : history.isError ? <p role="alert">{importError(history.error)} <button type="button" className="text-primary" onClick={() => void history.refetch()}>Tentar novamente</button></p> : !history.data.length ? <p>Nenhuma nota importada ainda.</p> : <ul className="space-y-2">{history.data.map((entry) => <li key={entry.id} className="border-t py-2">Nota {entry.notaNumber || 'sem número'} · {entry.tradeDate ? new Date(entry.tradeDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Data não informada'} · {brokers.data?.find((b) => b.id === entry.brokerId)?.name ?? entry.brokerId} · {notaHistoryStatus(entry.status)} · Referência {entry.id}</li>)}</ul>}
    </section>
  </div>;
}

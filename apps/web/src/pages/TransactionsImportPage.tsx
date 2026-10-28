import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { journalApi } from '@/lib/journal';
import { affectedImportKeys, csvRowMessage, downloadCsvTemplate, importApi, importError, type ImportResult } from '@/lib/imports';

export default function TransactionsImportPage() {
  const client = useQueryClient();
  const portfolios = useQuery({ queryKey: ['portfolios'], queryFn: journalApi.portfolios });
  const accounts = useQuery({ queryKey: ['import-accounts', portfolios.data?.map((p) => p.id)],
    queryFn: async () => (await Promise.all((portfolios.data ?? []).map((p) => journalApi.accounts(p.id)))).flat(),
    enabled: !!portfolios.data?.length });
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errors, setErrors] = useState<ImportResult['errors']>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const lock = useRef(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || lock.current || result) return;
    setError(''); setErrors([]); setResult(null);
    if (!/\.csv$/i.test(file.name) || !file.size || file.size > 1_000_000) {
      setError('Selecione um CSV não vazio de até 1 MB.'); return;
    }
    lock.current = true; setPending(true);
    try {
      const response = await importApi.csv(file);
      setResult(response);
      await Promise.all(affectedImportKeys.map((key) => client.invalidateQueries({ queryKey: [key] })));
    } catch (reason) {
      const message = importError(reason);
      setError(message === 'CSV file required (max 1 MB)' ? csvRowMessage(message) : message);
      if (reason && typeof reason === 'object' && 'errors' in reason && Array.isArray(reason.errors)) setErrors(reason.errors);
    } finally { lock.current = false; setPending(false); }
  }
  return <div className="space-y-6">
    <h1 className="font-display text-2xl font-bold">Importar transações</h1>
    <nav className="flex flex-wrap gap-4 text-primary"><Link to="/transactions">Voltar às transações</Link><Link to="/transactions/import/nota">Importar nota de corretagem</Link></nav>
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-4 sm:p-6">
      <h2 className="text-lg font-bold">Planilha CSV de transações</h2>
      <p className="text-sm">Até 1 MB e 200 linhas. Importação direta, sem prévia: confira os dados antes de enviar. Colunas: type, date (AAAA-MM-DD), account (nome exato da sua conta), symbol, qty, unitPriceCents, feeCents; fxRateToBRL opcional para ativos USD (câmbio histórico em milionésimos). Preços e taxas em centavos inteiros, sem separador decimal. O arquivo inteiro é rejeitado quando há erros.</p>
      {portfolios.isPending || accounts.isPending && !!portfolios.data?.length ? <p role="status">Carregando contas...</p> : null}
      {(portfolios.isError || accounts.isError) && <p role="alert">{importError(portfolios.error ?? accounts.error)} <button type="button" className="text-primary" onClick={() => { void portfolios.refetch(); void accounts.refetch(); }}>Tentar novamente</button></p>}
      {!portfolios.isPending && !accounts.isPending && !accounts.data?.length && <p>Nenhuma conta disponível. <Link className="text-primary underline" to="/settings">Crie uma carteira e uma conta em Configurações</Link> antes de importar.</p>}
      {!!accounts.data?.length && <button type="button" className="text-primary underline" onClick={() => downloadCsvTemplate(accounts.data![0]!.name)}>Baixar modelo CSV (conta: {accounts.data[0]!.name})</button>}
      <label className="block text-sm font-medium">Arquivo CSV<input type="file" disabled={pending} accept=".csv,text/csv" className="mt-2 block w-full" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult(null); setErrors([]); setError(''); }} /></label>
      {file && <p className="text-sm">Selecionado: {file.name}</p>}
      <button disabled={pending || !!result || !file || !accounts.data?.length} type="submit" className="rounded-lg bg-primary px-5 py-2 text-white disabled:opacity-50">{pending ? 'Importando...' : 'Importar CSV'}</button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!!errors?.length && <ul aria-label="Erros por linha" className="list-disc pl-5 text-red-700">{errors.map((item, i) => <li key={i}>Linha {item.line === 0 ? 'geral' : item.line}: {csvRowMessage(item.message)} <details className="text-sm"><summary>Detalhes técnicos</summary><span>{item.message}</span></details></li>)}</ul>}
      {result && <p role="status" className="text-green-700">{result.created} transações importadas. <Link className="underline" to="/transactions">Ver transações</Link></p>}
    </form>
  </div>;
}

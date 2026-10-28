import { api } from './api';

export interface ImportWarning { type: 'UNKNOWN_ASSET' | 'DATE_MISMATCH' | 'DUPLICATE'; message: string; details?: string }
export interface NotaItem {
  direction: 'C' | 'V'; symbol: string; qty: string; unitPriceCents: string;
  dayTrade: boolean; tradeDate?: string; type?: 'split' | 'jcp'; factor?: number;
}
export interface NotaPreview {
  brokerId: string; notaNumber: string; tradeDate: string; items: NotaItem[];
  fees: { liquidacao: string; corretagem: string; emolumentos: string; iss: string; irrf: string };
  rateio: string[]; warnings: ImportWarning[]; importToken: string;
}
export interface ImportHistory { id: string; brokerId: string; notaNumber: string; tradeDate: string; status: string; createdAt: string }
export interface ReturnedHolding { id: string; accountId: string; assetId: string; qty: string }
export interface ImportResult { created: number; holdings?: (ReturnedHolding | null)[]; errors?: { line: number; message: string }[] }

async function upload<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`/api/v1/transactions/import/${path}`, {
    method: 'POST', credentials: 'include', body: form,
  });
  let body: Record<string, unknown>;
  try { body = await response.json() as Record<string, unknown>; }
  catch {
    throw { status: response.status, message: `Resposta inválida do servidor (${response.status}).` };
  }
  if (!response.ok) {
    const error = body.error && typeof body.error === 'object' && !Array.isArray(body.error)
      ? body.error as { message?: string; code?: string } : undefined;
    throw { status: response.status, message: error?.message ?? `Erro ${response.status}`,
      code: error?.code, errors: body.errors as ImportResult['errors'] };
  }
  return body as T;
}

export const importApi = {
  csv: (file: File) => { const form = new FormData(); form.set('file', file); return upload<ImportResult>('csv', form); },
  preview: (file: File, accountId: string, brokerId: string) => {
    const form = new FormData();
    form.set('file', file); form.set('accountId', accountId); form.set('brokerId', brokerId);
    return upload<{ nota: NotaPreview }>('nota/preview', form);
  },
  confirm: (importToken: string) => api.post<ImportResult>('/v1/transactions/import/nota/confirm', { importToken }),
  history: async () => (await api.get<{ items: ImportHistory[] }>('/v1/transactions/import/nota/history')).items,
};

export function importError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Falha de rede. Verifique sua conexão e tente novamente.';
}

export function csvRowMessage(message: string): string {
  const known: Record<string, string> = {
    'Account not found': 'Conta não encontrada', 'Asset not found': 'Ativo não encontrado',
    'No rows found': 'Nenhuma linha encontrada', 'Maximum 200 rows': 'Máximo de 200 linhas',
    'Column count mismatch': 'A quantidade de colunas difere do cabeçalho; confira os separadores e campos entre aspas.',
    'Malformed CSV quoting': 'Aspas inválidas no CSV',
    'Unterminated CSV quoted field': 'Campo entre aspas não fechado',
    'Invalid type, date, account, symbol, positive qty/price, fee or FX rate':
      'Confira type, date (AAAA-MM-DD), account, symbol, qty e unitPriceCents positivos, feeCents não negativo e fxRateToBRL positivo quando informado.',
    'USD requires original historical FX; BRL must not include FX':
      'Ativos USD exigem fxRateToBRL histórico original; para BRL deixe o câmbio vazio.',
    'BRL transactions must not include FX': 'Para operações BRL, deixe fxRateToBRL vazio.',
    'USD transactions require a positive historical fxRateToBRL':
      'Para operações USD, informe fxRateToBRL histórico original positivo.',
    'CSV file required (max 1 MB)': 'Selecione um arquivo CSV não vazio de até 1 MB.',
    'Expected 1–200 rows': 'Informe entre 1 e 200 linhas de transações.',
  };
  if (message.startsWith('Required columns: ')) return 'Cabeçalho inválido ou duplicado. Colunas obrigatórias: ' + message.slice('Required columns: '.length);
  if (message.startsWith('Historical FX repair required for transaction IDs: ')) return 'Corrija o câmbio histórico das transações indicadas antes de importar novamente.';
  return known[message] ?? 'Não foi possível validar esta linha. Confira o arquivo e tente novamente.';
}

export function notaHistoryStatus(status: string): string {
  return status === 'confirmed' ? 'Confirmada' : `Situação não reconhecida (${status})`;
}

export function moneyCents(value: string): string {
  const cents = BigInt(value);
  const whole = cents / 100n;
  const fraction = (cents < 0n ? -cents : cents) % 100n;
  return `R$ ${new Intl.NumberFormat('pt-BR').format(whole)},${fraction.toString().padStart(2, '0')}`;
}

export const affectedImportKeys = ['transactions', 'holdings', 'position', 'summary', 'dashboard',
  'dashboard-summary', 'dashboard-allocation', 'dashboard-snapshots', 'dashboard-transactions',
  'dashboard-agenda', 'dividends', 'reports-snapshots', 'reports-sales', 'reports-income', 'nota-history'];

export function downloadCsvTemplate(accountName: string): void {
  const quoted = `"${accountName.replace(/"/g, '""')}"`;
  const csv = `type,date,account,symbol,qty,unitPriceCents,feeCents,fxRateToBRL\r\nbuy,2026-01-15,${quoted},PETR4,1,2500,0,\r\n`;
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'investy-modelo-transacoes.csv';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

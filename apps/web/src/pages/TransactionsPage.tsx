/**
 * Transactions list page.
 */

import { DataTable, type Column } from '@/components/ui/DataTable';

const mockTransactions = [
  { date: '2026-03-15', asset: 'PETR4', type: 'Compra', qty: 100, total: '2.850,00' },
  { date: '2026-03-10', asset: 'VALE3', type: 'Compra', qty: 50, total: '5.200,00' },
  { date: '2026-02-28', asset: 'ITUB4', type: 'Venda', qty: 30, total: '1.440,00' },
];

type Transaction = (typeof mockTransactions)[number];

const columns: Column<Transaction>[] = [
  { key: 'date', header: 'Data' },
  { key: 'asset', header: 'Ativo' },
  { key: 'type', header: 'Tipo' },
  { key: 'qty', header: 'Qtd.', align: 'right', tabular: true },
  { key: 'total', header: 'Total', align: 'right', tabular: true },
];

export default function TransactionsPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-gray-900">
        Transações
      </h1>
      <DataTable columns={columns} data={mockTransactions} />
    </div>
  );
}

/**
 * Transactions import page.
 */

import { Link } from 'react-router-dom';

export default function TransactionsImportPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-gray-900">
        Importar transações
      </h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          to="/transactions/import/nota"
          className="rounded-xl border border-gray-200 bg-surface p-6 transition-shadow hover:shadow-md"
        >
          <h2 className="font-display text-lg font-bold text-gray-900">
            Nota de corretagem
          </h2>
          <p className="mt-1 text-sm text-tertiary">
            Importe sua nota de corretagem B3 em PDF.
          </p>
        </Link>
        <div className="rounded-xl border border-dashed border-gray-300 bg-surface p-6">
          <h2 className="font-display text-lg font-bold text-gray-900">
            CSV / JSON
          </h2>
          <p className="mt-1 text-sm text-tertiary">
            Importação manual via arquivo — disponível em breve.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Transactions import — nota de corretagem page.
 */

export default function TransactionsImportNotaPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-gray-900">
        Importar nota de corretagem
      </h1>
      <div className="rounded-xl border border-dashed border-gray-300 bg-surface p-12 text-center">
        <p className="text-sm text-tertiary">
          Arraste e solte seu PDF aqui ou clique para selecionar.
        </p>
        <button
          type="button"
          className="mt-4 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
        >
          Selecionar arquivo
        </button>
      </div>
    </div>
  );
}

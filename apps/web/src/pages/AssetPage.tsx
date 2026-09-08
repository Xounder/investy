/**
 * Asset detail page.
 */

import { useParams } from 'react-router-dom';

export default function AssetPage() {
  const { symbol } = useParams<{ symbol: string }>();

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-gray-900">
        Ativo {symbol}
      </h1>
      <p className="text-sm text-tertiary">
        Informações do ativo — cotações e detalhes serão carregados em breve.
      </p>
    </div>
  );
}

/**
 * Holdings portfolio detail page.
 */

import { useParams } from 'react-router-dom';

export default function HoldingsPortfolioPage() {
  const { portfolioId } = useParams<{ portfolioId: string }>();

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-gray-900">
        Portfolio {portfolioId}
      </h1>
      <p className="text-sm text-tertiary">
        Detalhes do portfólio — dados de exemplo serão carregados em breve.
      </p>
    </div>
  );
}

/**
 * Holdings list page.
 */

import { Link } from 'react-router-dom';

const mockHoldings = [
  { id: 'p1', name: 'Portfólio Principal', value: 'R$ 198.250,00' },
  { id: 'p2', name: 'Renda Fixa', value: 'R$ 86.100,12' },
];

export default function HoldingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold text-gray-900">Holdings</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {mockHoldings.map((h) => (
          <Link
            key={h.id}
            to={`/holdings/${h.id}`}
            className="rounded-xl border border-gray-200 bg-surface p-5 transition-shadow hover:shadow-md"
          >
            <h2 className="text-sm font-medium text-tertiary">{h.name}</h2>
            <p className="mt-1 font-display text-xl font-bold tabular-nums">
              {h.value}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

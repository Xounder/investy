/**
 * Dashboard page (root route).
 * Renders KPI cards, indicator strip, and placeholder content.
 */

import { KpiCard } from '@/components/ui/KpiCard';
import { IndicatorStrip } from '@/components/ui/IndicatorStrip';

const mockIndicators = [
  { label: 'CDI', value: '13,75%', positive: undefined },
  { label: 'Selic', value: '14,75%', positive: undefined },
  { label: 'IBOV', value: '132.450', positive: true },
  { label: 'IFIX', value: '3.215', positive: false },
  { label: 'SPX', value: '5.890', positive: true },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-gray-900">
          Seu painel de investimentos
        </h1>
        <p className="mt-1 text-sm text-tertiary">
          Visão geral da sua carteira em tempo real
        </p>
      </div>

      <IndicatorStrip indicators={mockIndicators} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Patrimônio total"
          value="R$ 284.350,12"
          delta={{ value: '2,34%', positive: true }}
        />
        <KpiCard
          label="Rentabilidade (mês)"
          value="R$ 5.230,45"
          delta={{ value: '1,87%', positive: true }}
        />
        <KpiCard
          label="Dividendos (mês)"
          value="R$ 1.420,00"
          delta={{ value: '0,50%', positive: true }}
        />
        <KpiCard
          label="Investido (mês)"
          value="R$ 10.000,00"
          delta={{ value: '15,2%', positive: false }}
        />
      </div>
    </div>
  );
}

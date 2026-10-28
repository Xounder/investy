import type { FiiProjection } from '@/lib/dividends';
import { dateLabel } from '@/lib/journal-format';

export function FiiProjectionCard({ projection, symbol }: { projection: FiiProjection; symbol: string }) {
  return <article className="rounded-xl border bg-white p-4">
    <h3 className="font-semibold">{symbol}</h3>
    <p className="text-sm">Próxima data-com estimada: {dateLabel(projection.nextExDate)}</p>
    <p className="text-sm">Cadência: {projection.cadence === 'monthly' ? 'mensal' : 'irregular'} · Confiança: {projection.confidence === 'high' ? 'alta' : 'baixa'}</p>
    <p className="text-xs text-tertiary">Projeção baseada em histórico, não é garantia de pagamento nem de valor. Data de pagamento não estimada.</p>
  </article>;
}

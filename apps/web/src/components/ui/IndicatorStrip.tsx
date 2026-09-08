/**
 * Indicator strip component (design-05).
 * Horizontal row of benchmark chips: CDI, Selic, IBOV, IFIX, SPX
 * with colored status dots.
 */

interface Indicator {
  label: string;
  value: string;
  positive?: boolean;
}

interface IndicatorStripProps {
  indicators: Indicator[];
  loading?: boolean;
}

function Dot({ positive }: { positive?: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        positive === true
          ? 'bg-success'
          : positive === false
            ? 'bg-error'
            : 'bg-tertiary'
      }`}
    />
  );
}

export function IndicatorStrip({ indicators, loading }: IndicatorStripProps) {
  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-16 w-28 animate-pulse rounded-lg bg-gray-200"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {indicators.map((ind) => (
        <div
          key={ind.label}
          className="flex min-w-[112px] shrink-0 flex-col items-center rounded-lg border border-gray-200 bg-surface px-4 py-3"
        >
          <span className="text-xs font-medium text-tertiary">
            {ind.label}
          </span>
          <div className="mt-1 flex items-center gap-1.5">
            <Dot positive={ind.positive} />
            <span className="text-sm font-semibold tabular-nums">
              {ind.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

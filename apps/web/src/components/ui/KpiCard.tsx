/**
 * KPI card composite (design-05).
 *
 * Plus Jakarta Sans ExtraBold 30px value, Inter 14px label,
 * optional delta chip. Has a skeleton loading variant.
 */

import { Skeleton } from './Skeleton';

interface KpiCardProps {
  label: string;
  value: string;
  delta?: { value: string; positive: boolean };
  loading?: boolean;
}

export function KpiCard({ label, value, delta, loading }: KpiCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-surface p-5">
        <Skeleton variant="text" lines={2} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-surface p-5">
      <p className="text-sm text-tertiary">{label}</p>
      <p className="mt-1 font-display text-[30px] font-extrabold leading-tight tabular-nums">
        {value}
      </p>
      {delta && (
        <span
          className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            delta.positive
              ? 'bg-success-light text-success'
              : 'bg-error-light text-error'
          }`}
        >
          {delta.positive ? '↑' : '↓'} {delta.value}
        </span>
      )}
    </div>
  );
}

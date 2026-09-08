/**
 * Status badge / chip component (design-05).
 * Supports expected, confirmed, paid, warning, and neutral states.
 */

export type StatusVariant =
  | 'expected'
  | 'confirmed'
  | 'paid'
  | 'warning'
  | 'neutral';

interface StatusBadgeProps {
  variant: StatusVariant;
  label: string;
}

const variantStyles: Record<StatusVariant, string> = {
  expected: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-purple-100 text-purple-700',
  paid: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  neutral: 'bg-gray-100 text-gray-600',
};

const dotColors: Record<StatusVariant, string> = {
  expected: 'bg-blue-500',
  confirmed: 'bg-purple-500',
  paid: 'bg-green-500',
  warning: 'bg-yellow-500',
  neutral: 'bg-gray-400',
};

export function StatusBadge({ variant, label }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${variantStyles[variant]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColors[variant]}`} />
      {label}
    </span>
  );
}

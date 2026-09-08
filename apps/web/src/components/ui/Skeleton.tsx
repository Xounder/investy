/**
 * Loading skeleton component.
 * Renders geometric placeholders matching table / chart / card shapes.
 */

interface SkeletonProps {
  className?: string;
  /** Variant preset: text, card, table, chart */
  variant?: 'text' | 'card' | 'table' | 'chart';
  /** Number of skeleton lines to render (for text variant). */
  lines?: number;
}

const variantClasses: Record<string, string> = {
  text: 'h-4 w-full rounded',
  card: 'h-28 w-full rounded-xl',
  table: 'h-10 w-full rounded',
  chart: 'h-48 w-full rounded-xl',
};

export function Skeleton({
  className = '',
  variant = 'text',
  lines = 3,
}: SkeletonProps) {
  if (variant === 'text') {
    return (
      <div className={`space-y-2 ${className}`} aria-busy="true">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${variantClasses.text} animate-pulse bg-gray-200`}
            style={{ width: i === lines - 1 ? '60%' : '100%' }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${variantClasses[variant] ?? variantClasses.card} animate-pulse bg-gray-200 ${className}`}
      aria-busy="true"
    />
  );
}

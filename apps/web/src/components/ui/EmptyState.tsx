/**
 * Empty state component with CTA banner (design-05).
 */

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-surface px-6 py-16 text-center">
      <p className="text-base font-semibold text-gray-900">{title}</p>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-tertiary">{description}</p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-6 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

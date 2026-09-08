/**
 * Error card with retry button (design-05).
 */

interface ErrorCardProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorCard({ message, onRetry }: ErrorCardProps) {
  return (
    <div className="rounded-xl border border-error-light bg-error-light/50 px-6 py-5">
      <p className="text-sm font-medium text-error">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-error/30 px-4 py-1.5 text-sm font-medium text-error transition-colors hover:bg-error/10"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}

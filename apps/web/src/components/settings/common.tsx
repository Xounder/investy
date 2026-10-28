import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorCard } from '@/components/ui/ErrorCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { errorText, isUnauthorized } from '@/lib/journal';

export const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none';
export const buttonClass = 'rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
export const secondaryClass = 'rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-primary disabled:opacity-50';

export function useSessionError(error: unknown) {
  const navigate = useNavigate();
  useEffect(() => { if (isUnauthorized(error)) navigate('/login', { replace: true }); }, [error, navigate]);
}

export function Section({ title, children, danger = false }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return <section className={`rounded-xl border bg-white p-4 shadow-sm sm:p-6 ${danger ? 'border-red-300' : 'border-gray-200'}`}>
    <h2 className={`mb-4 font-display text-lg font-semibold ${danger ? 'text-red-700' : 'text-gray-900'}`}>{title}</h2>
    {children}
  </section>;
}

export function QueryState({ pending, error, retry }: { pending: boolean; error: unknown; retry: () => void }) {
  useSessionError(error);
  if (pending) return <Skeleton variant="table" className="mb-4" />;
  if (error) return <ErrorCard message={errorText(error)} onRetry={retry} />;
  return null;
}

export function MutationFeedback({ error, success, onRetry, pending = false }: { error: unknown; success?: string; onRetry?: () => void; pending?: boolean }) {
  useSessionError(error);
  return <>{error && <div role="alert" className="mt-3 rounded-xl border border-error-light bg-error-light/50 px-6 py-5">
    <p className="text-sm font-medium text-error">{errorText(error)}</p>
    {onRetry && <button type="button" disabled={pending} className="mt-3 rounded-lg border border-error/30 px-4 py-1.5 text-sm font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-50" onClick={onRetry}>Tentar novamente</button>}
  </div>}{!error && success && <p role="status" className="mt-3 text-sm text-green-700">{success}</p>}</>;
}

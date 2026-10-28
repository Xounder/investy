/**
 * Layout component: Sidebar + TopBar + content area.
 * Responsive collapse — sidebar hides on mobile, TopBar adjusts margin.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useUiStore } from '@/stores/ui';
import { clearOwnerState } from '@/lib/auth';
import { settingsApi } from '@/lib/settings';
import { isUnauthorized } from '@/lib/journal';

export function Layout() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const session = useQuery({ queryKey: ['settings', 'profile'], queryFn: settingsApi.profile, retry: false });
  useEffect(() => {
    if (!session.isError || !isUnauthorized(session.error)) return;
    navigate('/login', { replace: true, state: { from: location.pathname } });
    void clearOwnerState(client);
  }, [session.isError, session.error, client, navigate, location.pathname]);
  const registerFeedback = useUiStore((s) => s.registerFeedback);
  const setRegisterFeedback = useUiStore((s) => s.setRegisterFeedback);
  if (session.isPending || (session.isError && isUnauthorized(session.error))) return <div role="status" className="p-6"><span className="font-display font-bold text-primary">Investy</span><p>Verificando sessão…</p></div>;
  if (session.isError) return <div role="alert" className="p-6"><span className="font-display font-bold text-primary">Investy</span><h1 className="font-display text-xl font-bold">Seu painel de investimentos</h1><p>Não foi possível verificar sua sessão. Verifique sua conexão e tente novamente.</p><button type="button" className="text-primary underline" onClick={() => void session.refetch()}>Tentar novamente</button></div>;
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      {/* Offset for desktop sidebar */}
      <div className="md:ml-[var(--sidebar-width)]">
        <TopBar />
        <main className="p-4 md:p-6">
          {registerFeedback && <div role="status" className="mb-4 flex justify-between rounded-lg border border-green-300 bg-green-50 p-3 text-green-800">
            <span>{registerFeedback}</span><button type="button" aria-label="Dispensar confirmação" onClick={() => setRegisterFeedback(null)}>✕</button>
          </div>}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

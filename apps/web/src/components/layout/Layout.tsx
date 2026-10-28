/**
 * Layout component: Sidebar + TopBar + content area.
 * Responsive collapse — sidebar hides on mobile, TopBar adjusts margin.
 */

import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useUiStore } from '@/stores/ui';

export function Layout() {
  const registerFeedback = useUiStore((s) => s.registerFeedback);
  const setRegisterFeedback = useUiStore((s) => s.setRegisterFeedback);
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

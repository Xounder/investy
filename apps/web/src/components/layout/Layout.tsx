/**
 * Layout component: Sidebar + TopBar + content area.
 * Responsive collapse — sidebar hides on mobile, TopBar adjusts margin.
 */

import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      {/* Offset for desktop sidebar */}
      <div className="md:ml-[var(--sidebar-width)]">
        <TopBar />
        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

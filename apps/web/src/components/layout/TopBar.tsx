/**
 * Top bar component (design-02).
 *
 * Fixed bar with: hamburger (mobile), global search input,
 * portfolio selector dropdown, "+ Registrar" button.
 */

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUiStore } from '@/stores/ui';
import { PortfolioSelector } from '@/components/selectors/PortfolioSelector';

export function TopBar() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  return (
    <header className="sticky top-0 z-20 flex h-[var(--topbar-height)] items-center gap-4 border-b border-gray-200 bg-surface px-4 md:px-6">
      {/* Hamburger — mobile only */}
      <button
        type="button"
        onClick={toggleSidebar}
        className="rounded-lg p-1.5 text-tertiary hover:bg-gray-100 md:hidden"
        aria-label="Abrir menu"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Global search */}
      <div className="relative flex-1 md:max-w-md">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="search"
          placeholder="Buscar ativo..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-background py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-tertiary outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Portfolio selector */}
      <div className="hidden sm:block"><PortfolioSelector /></div>

      {/* + Registrar button: secondary → primary hover */}
      <button
        type="button"
        onClick={() => navigate('/global-action', { state: { background: location } })}
        className="shrink-0 rounded-lg border border-primary bg-transparent px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-white"
      >
        + Registrar
      </button>
    </header>
  );
}

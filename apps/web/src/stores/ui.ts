/**
 * Zustand store for transient UI state.
 *
 * TASK-06 creates the base store.
 * TASK-07 appends drawer/portfolio slices (never edit existing slices).
 */
import { create } from 'zustand';

export interface UiState {
  /** Sidebar open state (mobile overlay). */
  sidebarOpen: boolean;
  /** Active portfolio id for the selector. */
  activePortfolioId: string | null;
  registerPrefill: { type: 'sell' | 'jcp'; assetId: string; symbol: string; accountId: string; qty: string; priceCents: string | null; isStale: boolean } | null;
  setRegisterPrefill: (prefill: UiState['registerPrefill']) => void;
  registerFeedback: string | null;
  setRegisterFeedback: (message: string | null) => void;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActivePortfolioId: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  activePortfolioId: (() => { try { return localStorage.getItem('investy-portfolio'); } catch { return null; } })(),
  registerPrefill: null,
  setRegisterPrefill: (prefill) => set({ registerPrefill: prefill }),
  registerFeedback: null,
  setRegisterFeedback: (message) => set({ registerFeedback: message }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setActivePortfolioId: (id) => {
    try { if (id) localStorage.setItem('investy-portfolio', id); else localStorage.removeItem('investy-portfolio'); } catch { /* Storage unavailable. */ }
    set({ activePortfolioId: id });
  },
}));

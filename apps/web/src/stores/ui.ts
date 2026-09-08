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

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActivePortfolioId: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  activePortfolioId: null,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setActivePortfolioId: (id) => set({ activePortfolioId: id }),
}));

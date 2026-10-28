/**
 * V1 route configuration.
 *
 * Routes that use the main layout (sidebar + topbar) are nested under Layout.
 * Auth and onboarding routes render standalone (no layout).
 *
 * TASK-07 will edit the route table section only.
 */

import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Skeleton } from '@/components/ui/Skeleton';
import { RegisterDrawer } from '@/components/drawers/RegisterDrawer';
import { AssetDrawer } from '@/components/drawers/AssetDrawer';
import { useUiStore } from '@/stores/ui';

/** Lazy-loaded page modules. */
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const HoldingsPage = lazy(() => import('@/pages/HoldingsPage'));
const HoldingsPortfolioPage = lazy(
  () => import('@/pages/HoldingsPortfolioPage'),
);
const AssetPage = lazy(() => import('@/pages/AssetPage'));
const TransactionsPage = lazy(() => import('@/pages/TransactionsPage'));
const TransactionsImportPage = lazy(
  () => import('@/pages/TransactionsImportPage'),
);
const TransactionsImportNotaPage = lazy(
  () => import('@/pages/TransactionsImportNotaPage'),
);
const DividendsPage = lazy(() => import('@/pages/DividendsPage'));
const AssetsPage = lazy(() => import('@/pages/AssetsPage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SignupPage = lazy(() => import('@/pages/SignupPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'));
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'));

function PageLoader() {
  return (
    <div className="p-6">
      <span className="font-display text-lg font-bold">Investy</span>
      <Skeleton variant="card" />
    </div>
  );
}

/**
 * App routes — called by the root App component.
 * Split into a separate function so TASK-07 can edit this section
 * without touching provider wiring.
 */
export function AppRoutes() {
  const location = useLocation();
  const clearPrefill = useUiStore((s) => s.setRegisterPrefill);
  useEffect(() => { if (location.pathname !== '/global-action') clearPrefill(null); }, [location.pathname, clearPrefill]);
  const background = (location.state as { background?: Location } | null)?.background;
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes location={background || location}>
        {/* Auth routes (standalone, no layout) */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        {/* Onboarding (standalone) */}
        <Route path="/onboarding" element={<OnboardingPage />} />

        {/* Main app routes (with layout) */}
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="holdings" element={<HoldingsPage />} />
          <Route path="holdings/:portfolioId" element={<HoldingsPortfolioPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="assets/:symbol" element={<AssetPage />} />
          <Route path="global-action" element={<RegisterDrawer />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="transactions/import" element={<TransactionsImportPage />} />
          <Route path="transactions/import/nota" element={<TransactionsImportNotaPage />} />
          <Route path="dividends" element={<DividendsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Catch-all → dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {background && <Routes><Route path="/global-action" element={<RegisterDrawer />} /><Route path="/assets/:symbol" element={<AssetDrawer />} /></Routes>}
    </Suspense>
  );
}

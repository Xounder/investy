import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { adoptSession, authApi, authError } from '@/lib/auth';
import { journalApi } from '@/lib/journal';
import { useUiStore } from '@/stores/ui';
import { rotateSessionEpoch } from '@/lib/session-boundary';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const setActive = useUiStore((state) => state.setActivePortfolioId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!email.trim() || !password) { setError('Informe e-mail e senha.'); return; }
    setError(''); setPending(true);
    rotateSessionEpoch();
    try {
      await authApi.login({ email: email.trim(), password });
      const user = await authApi.me();
      await adoptSession(client, user);
      const portfolios = await journalApi.portfolios();
      const accounts = await Promise.all(portfolios.map((portfolio) => journalApi.accounts(portfolio.id)));
      const configured = portfolios.find((_, index) => accounts[index]?.length);
      if (configured) setActive(configured.id);
      const requested = (location.state as { from?: unknown } | null)?.from;
      const destination = typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//') && !['/login', '/signup'].includes(requested) ? requested : '/';
      navigate(configured ? destination : '/onboarding', { replace: true });
    } catch (reason) { setError(authError(reason)); }
    finally { setPending(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-center font-display text-2xl font-extrabold text-primary">
          Investy
        </h1>
        <p className="mt-2 text-center text-sm text-tertiary">
          Entre na sua conta
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              className="w-full rounded-lg border border-gray-200 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="voce@email.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              className="w-full rounded-lg border border-gray-200 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="••••••••"
            />
          </div>

          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
          >
            {pending ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          <Link to="/forgot-password" className="text-primary hover:underline">
            Esqueceu a senha?
          </Link>
          <Link to="/signup" className="text-primary hover:underline">
            Criar conta
          </Link>
        </div>
      </div>
    </div>
  );
}

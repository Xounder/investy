/**
 * Forgot password page skeleton.
 * Basic form wired to future API — no real auth yet.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: wire to API (TASK-09)
    setSubmitted(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-center font-display text-2xl font-extrabold text-primary">
          Investy
        </h1>
        <p className="mt-2 text-center text-sm text-tertiary">
          Recuperar senha
        </p>

        {submitted ? (
          <div className="mt-8 rounded-lg border border-success-light bg-success-light/50 p-4 text-center text-sm text-success">
            Se o e-mail estiver cadastrado, você receberá um link de recuperação.
          </div>
        ) : (
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
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="voce@email.com"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              Enviar link de recuperação
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="text-primary hover:underline">
            Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  );
}

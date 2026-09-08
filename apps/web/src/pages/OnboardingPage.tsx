/**
 * Onboarding wizard skeleton (design-02).
 * 3-step flow: portfolio → broker → first entry.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const steps = [
  { id: 1, title: 'Criar portfólio', description: 'Nome do seu portfólio' },
  { id: 2, title: 'Adicionar corretora', description: 'Selecione a corretora' },
  {
    id: 3,
    title: 'Primeira entrada',
    description: 'Registre sua primeira compra',
  },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [portfolioName, setPortfolioName] = useState('');
  const [brokerName, setBrokerName] = useState('');

  function handleNext() {
    if (step < 3) {
      setStep(step + 1);
    } else {
      // Finish onboarding → dashboard
      navigate('/');
    }
  }

  function handlePrev() {
    if (step > 1) setStep(step - 1);
  }

  const current = steps[step - 1]!;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <h1 className="text-center font-display text-2xl font-extrabold text-primary">
          Investy
        </h1>
        <p className="mt-2 text-center text-sm text-tertiary">
          Vamos configurar sua conta
        </p>

        {/* Step indicator */}
        <div className="mt-8 flex items-center justify-center gap-2">
          {steps.map((s) => (
            <span
              key={s.id}
              className={`h-2 w-2 rounded-full ${
                s.id <= step ? 'bg-primary' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-gray-200 bg-surface p-6">
          <h2 className="font-display text-lg font-bold text-gray-900">
            {current.title}
          </h2>
          <p className="mt-1 text-sm text-tertiary">{current.description}</p>

          <div className="mt-6 space-y-4">
            {step === 1 && (
              <div>
                <label htmlFor="portfolio-name" className="mb-1 block text-sm font-medium text-gray-700">
                  Nome do portfólio
                </label>
                <input
                  id="portfolio-name"
                  type="text"
                  value={portfolioName}
                  onChange={(e) => setPortfolioName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="Meus investimentos"
                />
              </div>
            )}

            {step === 2 && (
              <div>
                <label htmlFor="broker-name" className="mb-1 block text-sm font-medium text-gray-700">
                  Corretora
                </label>
                <select
                  id="broker-name"
                  value={brokerName}
                  onChange={(e) => setBrokerName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="">Selecione...</option>
                  <option value="xp">XP Investimentos</option>
                  <option value=" BTG">BTG Pactual</option>
                  <option value="itau">Itaú</option>
                  <option value="nubank">Nubank</option>
                </select>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <div>
                  <label htmlFor="ticker" className="mb-1 block text-sm font-medium text-gray-700">
                    Ticker
                  </label>
                  <input
                    id="ticker"
                    type="text"
                    className="w-full rounded-lg border border-gray-200 bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="PETR4"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="qty" className="mb-1 block text-sm font-medium text-gray-700">
                      Quantidade
                    </label>
                    <input
                      id="qty"
                      type="number"
                      className="w-full rounded-lg border border-gray-200 bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      placeholder="100"
                    />
                  </div>
                  <div>
                    <label htmlFor="price" className="mb-1 block text-sm font-medium text-gray-700">
                      Preço (R$)
                    </label>
                    <input
                      id="price"
                      type="number"
                      step="0.01"
                      className="w-full rounded-lg border border-gray-200 bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      placeholder="28,50"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="mt-6 flex gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={handlePrev}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Anterior
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
          >
            {step === 3 ? 'Finalizar' : 'Próximo'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-3 w-full text-center text-sm text-tertiary hover:text-gray-900"
        >
          Pular por enquanto
        </button>
      </div>
    </div>
  );
}

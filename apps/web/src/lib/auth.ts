import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useUiStore } from '@/stores/ui';
import type { Profile } from './settings';
import { rotateSessionEpoch } from './session-boundary';

export const authApi = {
  register: (body: { name: string; email: string; password: string }) => api.post<Profile>('/v1/auth/register', body),
  login: (body: { email: string; password: string }) => api.post<Profile>('/v1/auth/login', body),
  me: () => api.get<Profile>('/v1/auth/me'),
  logout: () => api.post<{ ok: boolean }>('/v1/auth/logout', {}),
};

export async function clearOwnerState(client: QueryClient) {
  await client.cancelQueries();
  client.clear();
  const ui = useUiStore.getState();
  ui.setActivePortfolioId(null);
  ui.setRegisterPrefill(null);
  ui.setRegisterFeedback(null);
  ui.setSidebarOpen(false);
}

export async function adoptSession(client: QueryClient, user: Profile) {
  if (!user.id) throw new Error('Não foi possível confirmar a sessão. Tente novamente.');
  rotateSessionEpoch();
  await clearOwnerState(client);
  client.setQueryData(['settings', 'profile'], user);
}

export function authError(error: unknown) {
  const status = (error as { status?: number })?.status;
  if (status === 409) return 'Este e-mail já está cadastrado. Entre na sua conta ou use outro e-mail.';
  if (status === 429) return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
  if (status === 401) return 'E-mail ou senha incorretos, ou sessão expirada. Confira os dados e tente novamente.';
  if (status === 400) return 'Dados inválidos. Confira e-mail, senha e demais campos.';
  return 'Não foi possível concluir a solicitação. Verifique sua conexão e tente novamente.';
}

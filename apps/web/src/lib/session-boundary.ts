// A request belongs to the browser session that started it, not whichever user
// happens to be logged in when its response arrives.
let epoch = 0;
const listeners = new Set<() => void>();

export function sessionEpoch() { return epoch; }
export function rotateSessionEpoch() { epoch++; }
export function assertSessionEpoch(startedAt: number) {
  if (startedAt !== epoch) throw new Error('Sessão alterada. Recarregue os dados da sua conta.');
}
export function subscribeSessionExpiry(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function checkProtectedResponse(response: Response, startedAt: number) {
  if (response.status !== 401 || startedAt !== epoch || listeners.size === 0) return;
  rotateSessionEpoch();
  for (const listener of listeners) listener();
}

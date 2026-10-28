import { describe, expect, it, vi } from 'vitest';
import { assertSessionEpoch, checkProtectedResponse, rotateSessionEpoch, sessionEpoch, subscribeSessionExpiry } from './session-boundary';

describe('protected response owner boundary', () => {
  it('signals once on current-session 401 and rejects late responses from the old owner', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSessionExpiry(listener);
    const oldEpoch = sessionEpoch();
    checkProtectedResponse(new Response(null, { status: 401 }), oldEpoch);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => assertSessionEpoch(oldEpoch)).toThrow('Sessão alterada');
    checkProtectedResponse(new Response(null, { status: 401 }), oldEpoch);
    expect(listener).toHaveBeenCalledTimes(1);
    rotateSessionEpoch();
    checkProtectedResponse(new Response(null, { status: 401 }), oldEpoch);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

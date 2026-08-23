/**
 * @fileOverview Verification role: protects centralized native cleanup for server-rejected authenticated sessions.
 * System connection: exercises the shared generated-client transport configured by AuthProvider.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMe,
  login,
  setAuthTokenGetter,
  setUnauthorizedHandler,
} from '@workspace/api-client-react';

const cleanup = vi.fn();

beforeEach(() => {
  cleanup.mockReset();
  setAuthTokenGetter(() => 'expired-session');
  setUnauthorizedHandler(cleanup);
});

afterEach(() => {
  setAuthTokenGetter(null);
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
});

describe('native unauthorized-session cleanup', () => {
  it('clears an authenticated session after a protected request returns 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Session expired' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(getMe()).rejects.toMatchObject({ status: 401 });
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('does not erase an existing session merely because a login attempt fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Wrong password' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(
      login({ email: 'person@example.com', password: 'incorrect' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(cleanup).not.toHaveBeenCalled();
  });
});

/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createSupabaseTokenSource,
  keepSessionFresh,
  type SessionTokenClient,
} from './supabaseTokenSource.js';

function stubClient(overrides: Partial<SessionTokenClient['auth']> = {}) {
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: { access_token: 'current' } } })),
    refreshSession: vi.fn(async () => ({
      data: { session: { access_token: 'refreshed' } },
      error: null,
    })),
    signOut: vi.fn(async () => undefined),
    startAutoRefresh: vi.fn(async () => undefined),
    stopAutoRefresh: vi.fn(async () => undefined),
    ...overrides,
  };
  return { auth } as unknown as SessionTokenClient & { auth: typeof auth };
}

describe('createSupabaseTokenSource', () => {
  it('reads the current session token — Supabase refreshes it when near expiry', async () => {
    const client = stubClient();
    await expect(createSupabaseTokenSource(client).getToken()).resolves.toBe('current');
  });

  it('returns the refreshed token on a successful refresh', async () => {
    const client = stubClient();
    await expect(createSupabaseTokenSource(client).refresh()).resolves.toBe('refreshed');
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it('signs out and reports no token when the refresh fails', async () => {
    const client = stubClient({
      refreshSession: vi.fn(async () => ({
        data: { session: null },
        error: { message: 'refresh_token_not_found' },
      })),
    });

    await expect(createSupabaseTokenSource(client).refresh()).resolves.toBeNull();
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('keepSessionFresh', () => {
  it('resumes auto-refresh on focus and stops it while hidden', () => {
    const client = stubClient();
    const stop = keepSessionFresh(client);

    // Mounted while visible: refresh is already running.
    expect(client.auth.startAutoRefresh).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(client.auth.stopAutoRefresh).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(client.auth.startAutoRefresh).toHaveBeenCalledTimes(2);
    // Returning to the window pulls the session, so the first refetch-on-focus
    // carries a live token.
    expect(client.auth.getSession).toHaveBeenCalled();

    stop();
    window.dispatchEvent(new Event('focus'));
    expect(client.auth.startAutoRefresh).toHaveBeenCalledTimes(2);
  });
});

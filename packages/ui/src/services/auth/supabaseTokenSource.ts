import { supabase } from '../supabase.js';
import { setTokenSource, type TokenSource } from './tokenStore.js';

/** The slice of the Supabase auth client the token source and keep-alive use. */
export interface SessionTokenClient {
  auth: {
    getSession: () => Promise<{ data: { session: { access_token?: string } | null } }>;
    refreshSession: () => Promise<{
      data: { session: { access_token?: string } | null };
      error: unknown;
    }>;
    signOut: () => Promise<unknown>;
    startAutoRefresh?: () => Promise<unknown>;
    stopAutoRefresh?: () => Promise<unknown>;
  };
}

/**
 * A {@link TokenSource} backed by Supabase.
 *
 * `getSession` is the fresh read: Supabase refreshes the token itself when it is
 * at or near expiry, which is exactly what a request fired from a long-idle tab
 * needs. A failed `refresh` means the stored refresh token is gone or rejected,
 * i.e. the user is genuinely signed out — so it signs out locally, which fires
 * the auth-state listener and lands the shell on the login screen instead of
 * looping on retries.
 */
export function createSupabaseTokenSource(
  client: SessionTokenClient = supabase,
): TokenSource {
  return {
    async getToken() {
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },
    async refresh() {
      const { data, error } = await client.auth.refreshSession();
      const token = data?.session?.access_token ?? null;
      if (error || !token) {
        // Genuinely signed out — tell Supabase so the shells' auth listener
        // routes to login rather than leaving a dead session in place.
        await client.auth.signOut().catch(() => undefined);
        return null;
      }
      return token;
    },
  };
}

/** Installs the Supabase-backed token source for the shared API client. */
export function installSupabaseTokenSource(
  client: SessionTokenClient = supabase,
) {
  setTokenSource(createSupabaseTokenSource(client));
}

/**
 * Drives Supabase's auto-refresh from window focus/visibility instead of relying
 * on its timer, which browsers throttle in a hidden tab or a window parked
 * behind another — the reason a desktop session left idle came back expired.
 * Also forces a session read on focus so the very first request after the
 * operator returns already carries a live token.
 *
 * Returns the effect cleanup.
 */
export function keepSessionFresh(
  client: SessionTokenClient = supabase,
): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return () => undefined;
  }

  const ignore = () => undefined;
  const resume = () => {
    Promise.resolve(client.auth.startAutoRefresh?.()).catch(ignore);
    // Pull the session immediately: startAutoRefresh schedules, it does not
    // guarantee a token that is already stale is replaced before the first
    // refetch-on-focus fires.
    client.auth.getSession().catch(ignore);
  };
  const suspend = () => {
    Promise.resolve(client.auth.stopAutoRefresh?.()).catch(ignore);
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') resume();
    else suspend();
  };

  if (document.visibilityState === 'visible') resume();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', resume);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', resume);
  };
}

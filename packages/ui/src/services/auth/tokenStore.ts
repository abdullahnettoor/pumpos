/**
 * The API client's access token, resolved *per request* rather than read from a
 * snapshot written minutes ago.
 *
 * The old design pushed the JWT in from an auth-state-change callback and the
 * request path read whatever was last pushed. While a window is hidden the
 * browser throttles Supabase's refresh timer, so that snapshot quietly expires
 * in place and every request fired from a background tab carried a dead token —
 * the "Invalid or expired authentication token" banner that healed itself on
 * focus.
 *
 * So the token is a **pull**: `getAccessToken()` asks the installed
 * {@link TokenSource} for the current session token (Supabase's session read
 * refreshes it when it is at or near expiry), and `refreshAccessToken()` forces
 * a refresh after a 401, sharing one in-flight refresh across every request that
 * hit the expired token so they don't stampede.
 */

export interface TokenSource {
  /** The current access token, refreshed by the provider if near expiry. */
  getToken: () => Promise<string | null>;
  /** Force a session refresh. Resolves null when the user is really signed out. */
  refresh: () => Promise<string | null>;
}

/**
 * Last known token. Kept as a fallback for shells/tests that never install a
 * source, and refreshed opportunistically so a source outage degrades to the
 * previous behaviour rather than to no auth at all.
 */
let snapshot = '';
let source: TokenSource | null = null;
let inFlightRefresh: Promise<string | null> | null = null;

/**
 * Records the token from an auth-state change. Still useful as the fallback and
 * for immediate availability right after sign-in, but it is no longer what the
 * request path depends on.
 */
export function setAuthToken(token: string) {
  snapshot = token;
  if (!token) {
    inFlightRefresh = null;
  }
}

/** Installs the session-backed token source. Pass null to uninstall (tests). */
export function setTokenSource(next: TokenSource | null) {
  source = next;
  inFlightRefresh = null;
}

/** The token to send with the next request. Never throws. */
export async function getAccessToken(): Promise<string> {
  if (!source) return snapshot;
  try {
    const token = await source.getToken();
    if (token) {
      snapshot = token;
      return token;
    }
  } catch (error) {
    console.error('Failed to resolve the current access token:', error);
  }
  return snapshot;
}

/**
 * Forces one session refresh, shared by every caller that asks while it is in
 * flight. Resolves null when the refresh fails (treated as signed out) so the
 * caller surfaces the original 401 instead of retrying forever.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!source) return Promise.resolve(null);
  if (!inFlightRefresh) {
    const current = source;
    inFlightRefresh = current
      .refresh()
      .then((token) => {
        if (token) snapshot = token;
        return token ?? null;
      })
      .catch((error) => {
        console.error('Failed to refresh the auth session:', error);
        return null;
      })
      .finally(() => {
        inFlightRefresh = null;
      });
  }
  return inFlightRefresh;
}

/** Test seam: drops the source, the snapshot and any in-flight refresh. */
export function resetAuthTokenState() {
  snapshot = '';
  source = null;
  inFlightRefresh = null;
}

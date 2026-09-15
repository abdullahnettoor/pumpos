import { supabase } from '../supabase.js';
import { runTask } from '../../utils/runTask.js';

/**
 * The shape of a stored auth session, as far as bootstrap cares. Deliberately
 * structural: the shells pass Supabase's own `Session`, and the tests pass a
 * stub, and neither needs to know about the other.
 */
export type StoredSession = unknown;

/** The slice of the Supabase client this module uses. */
export interface SessionReader {
  auth: {
    getSession: () => Promise<{ data: { session: StoredSession | null } }>;
    onAuthStateChange: (handler: (event: unknown, session: StoredSession | null) => void) => {
      data: { subscription: { unsubscribe: () => void } };
    };
  };
}

/**
 * Reads the stored auth session once at start-up and hands it to `onSession`.
 *
 * The rejection path is the whole point of this function. `getSession` reads
 * persisted storage and may refresh the token over the network, so it rejects
 * on a corrupt token or a connectivity drop. When it did, the `.then` never
 * ran, `loading` was never cleared, and the operator sat on a spinner with no
 * way forward — no login form, no error, nothing to click.
 *
 * So a failed read is treated as **signed out**, not as "unknown". That is the
 * safe direction: the worst case is an unnecessary login, whereas the
 * alternative is a dead application. `onSession(null)` is each shell's
 * signed-out path, which clears the token, stops loading and routes to login.
 *
 * Resolves once `onSession` has settled, so a caller (or a test) can await the
 * app reaching a decided state.
 */
export async function bootstrapSession(
  client: SessionReader,
  onSession: (session: StoredSession | null) => void | Promise<void>,
): Promise<void> {
  let session: StoredSession | null;
  try {
    const result = await client.auth.getSession();
    session = result.data.session;
  } catch (error) {
    console.error('Failed to read auth session:', error);
    session = null;
  }
  await onSession(session);
}

/**
 * Subscribes to sign-in / sign-out / token-refresh events, forwarding each to
 * `onSession`. Returns the unsubscribe function for effect cleanup.
 */
export function subscribeToSessionChanges(
  client: SessionReader,
  onSession: (session: StoredSession | null) => void | Promise<void>,
): () => void {
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => {
    // Same reasoning as the initial read: this callback is a void slot, so a
    // rejected handler would vanish. Nothing here can show the operator a
    // message — the shell may be mid-teardown — but it must not be silent.
    runTask(onSession(session), (error) => {
      console.error('Failed to apply an auth state change:', error);
    });
  });
  return () => subscription.unsubscribe();
}

/**
 * The whole start-up dance for a shell: read the stored session, then keep
 * listening for changes. Returns the effect cleanup.
 *
 * Shells call this from an effect and ignore the returned promise; tests await
 * `ready` to assert the app reached a decided state.
 */
export function startSession(
  onSession: (session: StoredSession | null) => void | Promise<void>,
  client: SessionReader = supabase,
): { ready: Promise<void>; stop: () => void } {
  const ready = bootstrapSession(client, onSession);
  const stop = subscribeToSessionChanges(client, onSession);
  return { ready, stop };
}

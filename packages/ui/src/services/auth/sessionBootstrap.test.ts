import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { bootstrapSession, startSession, subscribeToSessionChanges } from './sessionBootstrap.js';
import type { SessionReader } from './sessionBootstrap.js';

/**
 * Builds a stub of the slice of the Supabase client bootstrap touches.
 * `getSession` is whatever the test needs it to be; the subscription is real
 * enough to assert unsubscribe wiring.
 */
function stubClient(getSession: () => Promise<{ data: { session: unknown } }>) {
  const unsubscribe = vi.fn();
  let emit: ((event: unknown, session: unknown) => void) | null = null;
  const client: SessionReader = {
    auth: {
      getSession,
      onAuthStateChange: (handler) => {
        emit = handler;
        return { data: { subscription: { unsubscribe } } };
      },
    },
  };
  return { client, unsubscribe, emit: (session: unknown) => emit?.('SIGNED_IN', session) };
}

describe('bootstrapSession', () => {
  let consoleError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {}) as ReturnType<
      typeof vi.fn
    >;
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  it('hands the stored session to the shell when the read succeeds', async () => {
    const session = { access_token: 'tok', user: { id: 'u1' } };
    const onSession = vi.fn();
    const { client } = stubClient(() => Promise.resolve({ data: { session } }));

    await bootstrapSession(client, onSession);

    expect(onSession).toHaveBeenCalledWith(session);
  });

  it('reports signed out when there is no stored session', async () => {
    const onSession = vi.fn();
    const { client } = stubClient(() => Promise.resolve({ data: { session: null } }));

    await bootstrapSession(client, onSession);

    expect(onSession).toHaveBeenCalledWith(null);
  });

  // THE regression. Before the fix a rejection here meant `onSession` never ran
  // at all, so `loading` stayed true and the operator sat on a dead spinner.
  it('falls back to signed out when the session read rejects', async () => {
    const onSession = vi.fn();
    const { client } = stubClient(() => Promise.reject(new Error('network down')));

    await bootstrapSession(client, onSession);

    expect(onSession).toHaveBeenCalledTimes(1);
    expect(onSession).toHaveBeenCalledWith(null);
  });

  it('does not reject when the session read rejects, so the caller is never stuck', async () => {
    const { client } = stubClient(() => Promise.reject(new Error('corrupt token')));

    await expect(bootstrapSession(client, vi.fn())).resolves.toBeUndefined();
  });

  it('logs the underlying failure rather than swallowing it silently', async () => {
    const boom = new Error('refresh failed');
    const { client } = stubClient(() => Promise.reject(boom));

    await bootstrapSession(client, vi.fn());

    expect(consoleError).toHaveBeenCalledWith('Failed to read auth session:', boom);
  });

  // The shells' signed-out handler is async (it clears caches). The promise has
  // to cover that too, or a test — or a caller — can observe a half-done state.
  it('resolves only after an async onSession has settled', async () => {
    let finish!: () => void;
    const settled = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let done = false;
    const { client } = stubClient(() => Promise.reject(new Error('nope')));

    const ready = bootstrapSession(client, () => settled).then(() => {
      done = true;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toBe(false);

    finish();
    await ready;
    expect(done).toBe(true);
  });
});

describe('subscribeToSessionChanges', () => {
  it('forwards auth state changes and returns an unsubscribe', () => {
    const onSession = vi.fn();
    const { client, unsubscribe, emit } = stubClient(() =>
      Promise.resolve({ data: { session: null } }),
    );

    const stop = subscribeToSessionChanges(client, onSession);
    emit({ access_token: 'new' });
    expect(onSession).toHaveBeenCalledWith({ access_token: 'new' });

    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('startSession', () => {
  it('still subscribes to future auth changes after a failed initial read', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSession = vi.fn();
    const { client, emit } = stubClient(() => Promise.reject(new Error('offline')));

    const { ready, stop } = startSession(onSession, client);
    await ready;

    // Signed out on boot...
    expect(onSession).toHaveBeenNthCalledWith(1, null);

    // ...but a later sign-in must still land, or the operator could never
    // recover from the failed read without a reload.
    emit({ access_token: 'recovered' });
    expect(onSession).toHaveBeenNthCalledWith(2, { access_token: 'recovered' });

    stop();
    consoleError.mockRestore();
  });
});

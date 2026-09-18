import { describe, expect, it, vi } from 'vitest';
import { startSessionBoot } from './sessionBoot.js';

/** A promise plus the handle to settle it, so a test can hold a request open. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('startSessionBoot', () => {
  it('puts the stations request in flight before the session call resolves', async () => {
    // This is the regression the ticket is about. The old code awaited
    // getCurrentSession() and only then fetched stations, so a cold sign-in
    // cost the SUM of both round trips on a station connection that is often
    // slow. Holding the session call open proves stations no longer queue
    // behind it.
    const session = deferred<{ user: { role: string } }>();
    const loadSession = vi.fn(() => session.promise);
    const prefetchStations = vi.fn(() => Promise.resolve());

    const boot = startSessionBoot({ loadSession, prefetchStations });

    expect(prefetchStations).toHaveBeenCalledTimes(1);
    expect(loadSession).toHaveBeenCalledTimes(1);

    session.resolve({ user: { role: 'Owner' } });
    await boot;
  });

  it('resolves as soon as the session lands, without waiting on stations', async () => {
    // The shell renders off this promise. If it waited for stations too, the
    // viewport would stay blocked for both round trips even though they now
    // overlap — parallel requests but the same serial wait.
    const stations = deferred<void>();
    const boot = startSessionBoot({
      loadSession: async () => ({ user: { role: 'Owner' } }),
      prefetchStations: () => stations.promise,
    });

    await expect(boot).resolves.toEqual({ user: { role: 'Owner' } });

    stations.resolve();
  });

  it('surfaces a session failure, which is what gates the error screens', async () => {
    const boom = new Error('Profile not found');

    await expect(
      startSessionBoot({
        loadSession: () => Promise.reject(boom),
        prefetchStations: () => Promise.resolve(),
      }),
    ).rejects.toThrow('Profile not found');
  });

  it('does not let a stations failure reject the boot', async () => {
    // Stations are rendered as skeletons and retried by the query layer, so a
    // failure there must not take down a sign-in that otherwise succeeded —
    // and must not surface as an unhandled rejection either.
    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);

    const result = await startSessionBoot({
      loadSession: async () => ({ user: { role: 'Owner' } }),
      prefetchStations: () => Promise.reject(new Error('offline')),
    });

    await new Promise((r) => setTimeout(r, 10));
    process.off('unhandledRejection', onUnhandled);

    expect(result).toEqual({ user: { role: 'Owner' } });
    expect(onUnhandled).not.toHaveBeenCalled();
  });
});

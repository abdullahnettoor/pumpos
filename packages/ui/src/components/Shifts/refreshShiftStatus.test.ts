import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../../query/hooks.js';
import { refreshShiftStatus } from './refreshShiftStatus.js';

/** Lets every already-queued microtask run, without counting turns by hand. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A promise plus the lever that settles it, so a test can hold a step open. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('refreshShiftStatus', () => {
  it('does not resolve until the active full shift-status query has refetched', async () => {
    const refetch = deferred();
    const invalidateOperational = vi.fn(() => Promise.resolve());
    const queryClient = { refetchQueries: vi.fn(() => refetch.promise) };
    let resolved = false;

    const refresh = refreshShiftStatus(queryClient, invalidateOperational, 'station-1').then(() => {
      resolved = true;
    });
    await flush();

    expect(invalidateOperational).toHaveBeenCalledWith('station-1');
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.shiftStatus('station-1', false),
      type: 'active',
    });
    expect(resolved).toBe(false);

    refetch.resolve();
    await refresh;
    expect(resolved).toBe(true);
  });

  // The full shift-status refetch has to observe the invalidations, so it must
  // not be issued while they are still in flight.
  it('waits for the operational invalidations before refetching shift status', async () => {
    const invalidations = deferred();
    const invalidateOperational = vi.fn(() => invalidations.promise);
    const queryClient = { refetchQueries: vi.fn(() => Promise.resolve()) };

    const refresh = refreshShiftStatus(queryClient, invalidateOperational, 'station-1');
    await flush();

    expect(invalidateOperational).toHaveBeenCalledWith('station-1');
    expect(queryClient.refetchQueries).not.toHaveBeenCalled();

    invalidations.resolve();
    await refresh;
    expect(queryClient.refetchQueries).toHaveBeenCalledTimes(1);
  });

  // Without a station there is nothing station-scoped to refetch, but the
  // cross-station operational caches still have to be invalidated.
  it('still invalidates operational caches when there is no station', async () => {
    const invalidateOperational = vi.fn(() => Promise.resolve());
    const queryClient = { refetchQueries: vi.fn(() => Promise.resolve()) };

    await refreshShiftStatus(queryClient, invalidateOperational, null);

    expect(invalidateOperational).toHaveBeenCalledWith(null);
    expect(queryClient.refetchQueries).not.toHaveBeenCalled();
  });
});

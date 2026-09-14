import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../../query/hooks.js';
import { refreshShiftStatus } from './refreshShiftStatus.js';

describe('refreshShiftStatus', () => {
  it('does not resolve until the active full shift-status query has refetched', async () => {
    let finishRefetch!: () => void;
    const refetch = new Promise<void>((resolve) => {
      finishRefetch = resolve;
    });
    const invalidateOperational = vi.fn();
    const queryClient = {
      refetchQueries: vi.fn(() => refetch),
    };
    let resolved = false;

    const refresh = refreshShiftStatus(queryClient, invalidateOperational, 'station-1').then(() => {
      resolved = true;
    });
    await Promise.resolve();

    expect(invalidateOperational).toHaveBeenCalledWith('station-1');
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.shiftStatus('station-1', false),
      type: 'active',
    });
    expect(resolved).toBe(false);

    finishRefetch();
    await refresh;
    expect(resolved).toBe(true);
  });
});

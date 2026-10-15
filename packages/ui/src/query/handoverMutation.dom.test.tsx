// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders.js';

/**
 * The refresh after a handover runs unawaited, so the write settles without it.
 * That is deliberate — but it means a failed refresh leaves the operator
 * looking at stale balances on a shift-close screen. #240 sank that into
 * `console.error`; every other background task in the app routes through
 * `useRunTask`, which also toasts.
 *
 * The unit test next door proves the options builder calls its injected
 * runner. Since #606 the operator learns of a failed refresh on the page
 * itself (an inline Retry beside totals held as "Saving…"), so the hook's
 * runner only logs it; this pins that it is not a toast.
 */
const recordHandover = vi.fn();

vi.mock('../services/cloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CloudShiftService: class {
    recordHandover = (...a: unknown[]) => recordHandover(...a);
  },
}));

const { useRecordHandoverMutation, HANDOVER_REFRESH_FAILED } =
  await import('./handoverMutation.js');

const Harness: React.FC = () => {
  const mutation = useRecordHandoverMutation();
  return (
    <button
      type="button"
      onClick={() =>
        void mutation.mutateAsync({
          stationId: 'station-1',
          payload: {
            shiftId: 'shift-1',
            userId: 'user-1',
            duId: 'du-1',
            cashHandedOver: 100,
            nozzleReadings: [],
          },
          idempotencyKey: 'key-1',
        })
      }
    >
      Record
    </button>
  );
};

describe('useRecordHandoverMutation', () => {
  afterEach(() => {
    cleanup();
    recordHandover.mockReset();
  });

  it('reports a failed post-handover refresh to the console, not a toast (#606)', async () => {
    // The board and close page show it inline with Retry (handoverPatch.dom.test).
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => void errors.push(a[0]);
    try {
      recordHandover.mockResolvedValue({
        expectedTotal: 900,
        declaredTotal: 910,
        varianceAmount: 10,
      });
      const { queryClient } = renderWithProviders(<Harness />);
      // The refresh is the only thing failing; the write itself succeeded.
      vi.spyOn(queryClient, 'invalidateQueries').mockRejectedValue(new Error('offline'));

      screen.getByRole('button', { name: 'Record' }).click();

      await waitFor(() => expect(errors).toContain(HANDOVER_REFRESH_FAILED));
      expect(screen.queryByText(HANDOVER_REFRESH_FAILED)).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      console.error = original;
    }
  });

  it('reports nothing when the refresh succeeds', async () => {
    recordHandover.mockResolvedValue({
      expectedTotal: 900,
      declaredTotal: 910,
      varianceAmount: 10,
    });
    const { queryClient } = renderWithProviders(<Harness />);
    const invalidated = vi.spyOn(queryClient, 'invalidateQueries');

    screen.getByRole('button', { name: 'Record' }).click();

    // Wait for the refresh to actually have run, so the absence of a toast is
    // measured after the point one would have appeared.
    await waitFor(() => expect(invalidated).toHaveBeenCalled());
    await waitFor(() => expect(invalidated.mock.results.length).toBeGreaterThan(0));
    await Promise.all(invalidated.mock.results.map((r) => r.value));
    expect(screen.queryByText(HANDOVER_REFRESH_FAILED)).toBeNull();
  });
});

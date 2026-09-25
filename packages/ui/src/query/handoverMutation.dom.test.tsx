// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { renderWithProviders, muteExpectedConsoleErrors } from '../test/renderWithProviders.js';

/**
 * The refresh after a handover runs unawaited, so the write settles without it.
 * That is deliberate — but it means a failed refresh leaves the operator
 * looking at stale balances on a shift-close screen. #240 sank that into
 * `console.error`; every other background task in the app routes through
 * `useRunTask`, which also toasts.
 *
 * The unit test next door proves the options builder calls its injected
 * runner. This proves the hook injects one that actually reaches the operator
 * — the half that a fake runner can never show.
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

  it('toasts the operator when the post-handover refresh fails', async () => {
    const restoreConsole = muteExpectedConsoleErrors([/could not be refreshed/]);
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

      await waitFor(() => expect(screen.getByText(HANDOVER_REFRESH_FAILED)).toBeDefined());
    } finally {
      restoreConsole();
    }
  });

  it('does not toast when the refresh succeeds', async () => {
    // Paired with the case above: without it, that one would also pass against
    // a build that toasts unconditionally.
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

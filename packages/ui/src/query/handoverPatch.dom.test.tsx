// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import {
  createTestQueryClient,
  renderWithProviders,
  muteExpectedConsoleErrors,
} from '../test/renderWithProviders.js';
import { cachedStatus, ravisHandover } from './patches/shiftStatus.fixtures.js';

/**
 * #606: the shift board changes from the handover's own answer. The status
 * refetch the save starts is held open forever here, so anything the board
 * shows after the save came from the patch, not from the server re-reading.
 */
const recordHandover = vi.fn();
const getShiftStatus = vi.fn();

vi.mock('../services/cloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CloudShiftService: class {
    recordHandover = (...a: unknown[]) => recordHandover(...a);
    getShiftStatus = (...a: unknown[]) => getShiftStatus(...a);
  },
}));

const { useRecordHandoverMutation } = await import('./handoverMutation.js');
const { queryKeys, useShiftStatus } = await import('./hooks.js');
const { nozzleGroups } = await import('../components/Shifts/liveShiftModel.js');
const { NozzleReadingsTable } = await import('../components/Shifts/NozzleReadingsTable.js');

const Board: React.FC = () => {
  const statusQ = useShiftStatus('station-1');
  const mutation = useRecordHandoverMutation();
  const shift = statusQ.data?.activeShift;
  if (!shift) return null;
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void mutation
            .mutateAsync({
              stationId: 'station-1',
              payload: {
                shiftId: 'shift-1',
                userId: 'u-ravi',
                duId: 'du-1',
                cashHandedOver: 10700,
                nozzleReadings: [{ nozzleId: 'nz-1', closingReading: 1100 }],
              },
              idempotencyKey: 'key-1',
            })
            .catch(() => undefined)
        }
      >
        Save
      </button>
      <NozzleReadingsTable
        groups={nozzleGroups(shift, { now: Date.parse('2026-10-15T09:00:00Z') })}
        onOpenHandover={() => undefined}
      />
    </>
  );
};

function seededBoard() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.shiftStatus('station-1', false), cachedStatus());
  return renderWithProviders(<Board />, { queryClient });
}

/** Ravi's Drawer group header row: "DU1 · Ravi" with its status chip. */
const raviHeader = () => screen.getByText('DU1 · Ravi').parentElement as HTMLElement;

describe('handover save → shift board (#606)', () => {
  afterEach(() => {
    cleanup();
    recordHandover.mockReset();
    getShiftStatus.mockReset();
  });

  it('turns the Drawer Recorded with its variance while the refetch never answers', async () => {
    getShiftStatus.mockReturnValue(new Promise(() => {}));
    recordHandover.mockResolvedValue(ravisHandover);
    seededBoard();
    expect(within(raviHeader()).getByText('Pending')).toBeDefined();

    screen.getByRole('button', { name: 'Save' }).click();

    await waitFor(() => expect(within(raviHeader()).getByText(/^Recorded/)).toBeDefined());
    expect(raviHeader().querySelector('[data-variance="short"]')?.textContent).toContain('50');
    // The closing reading the server accepted fills the nozzle row.
    expect(screen.getByRole('table').textContent).toMatch(/1,?100\.000/);
    // It did ask the server again, in the background.
    expect(getShiftStatus).toHaveBeenCalled();
  });

  it('leaves the board as it was when the save fails', async () => {
    const restore = muteExpectedConsoleErrors([/Shift is closed/]);
    try {
      recordHandover.mockRejectedValue(new Error('Shift is closed'));
      const { queryClient } = seededBoard();
      const before = queryClient.getQueryData(queryKeys.shiftStatus('station-1', false));

      screen.getByRole('button', { name: 'Save' }).click();

      await waitFor(() => expect(recordHandover).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(queryClient.getQueryData(queryKeys.shiftStatus('station-1', false))).toBe(before);
      expect(within(raviHeader()).getByText('Pending')).toBeDefined();
      expect(getShiftStatus).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

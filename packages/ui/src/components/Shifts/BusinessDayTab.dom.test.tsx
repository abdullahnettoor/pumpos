// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import {
  renderWithProviders,
  createTestQueryClient,
  muteExpectedConsoleErrors,
} from '../../test/renderWithProviders.js';

/**
 * Closing a business day generates the immutable DSSR snapshot and seals sales
 * and stock for that date. It cannot be undone from the product, so the guards
 * around the button matter more than anything it renders: who may press it,
 * when it must be refused, and exactly what gets called.
 */
const closeBusinessDay = vi.fn();

vi.mock('../../services/cloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CloudShiftService: class {
    closeBusinessDay = (...a: unknown[]) => closeBusinessDay(...a);
  },
}));

// Pinned so the "is this today?" comparisons are deterministic; the real hook
// re-resolves on a 30s interval against the station clock.
vi.mock('../../hooks/useStationBusinessDate.js', () => ({
  useStationBusinessDate: () => '2026-03-01',
}));

const { BusinessDayTab } = await import('./BusinessDayTab.js');
const { queryKeys } = await import('../../query/hooks.js');

const STATION = { id: 'station-1', name: 'Test RO', settings: {} };
const TODAY = '2026-03-01';

type Seed = {
  status?: string;
  businessDayId?: string;
  snapshotData?: Record<string, unknown> | null;
  activeShift?: unknown;
  openBusinessDays?: { businessDate: string; id?: string }[];
};

const renderTab = (props: Record<string, unknown> = {}, seed: Seed = {}) => {
  const {
    status = 'OPEN',
    businessDayId = 'bd-1',
    snapshotData = { businessDayId },
    activeShift = null,
    openBusinessDays = [{ businessDate: TODAY, id: businessDayId }],
  } = seed;
  const client = createTestQueryClient();
  const statusPayload = {
    requestedState: status,
    openBusinessDays,
    requestedBusinessDay: { id: businessDayId, businessDate: TODAY },
  };
  client.setQueryData(queryKeys.businessDayStatus(STATION.id, TODAY), statusPayload);
  client.setQueryData(queryKeys.businessDayStatus(STATION.id, ''), statusPayload);
  client.setQueryData(queryKeys.dssrPreview(STATION.id, TODAY), {
    snapshotData,
    live: true,
    generatedAt: '2026-03-01T12:00:00.000Z',
  });
  client.setQueryData(queryKeys.dssr(STATION.id, TODAY), {
    snapshotData,
    generatedAt: '2026-03-01T12:00:00.000Z',
  });
  client.setQueryData(queryKeys.shiftStatus(STATION.id, true), { activeShift });
  client.setQueryData(queryKeys.customers(true), []);
  return renderWithProviders(
    <BusinessDayTab
      selectedStation={STATION}
      userRole="Owner"
      {...(props as Record<string, never>)}
    />,
    { queryClient: client },
  );
};

const closeDayButton = () =>
  screen.queryByRole('button', { name: /Close business day/i }) as HTMLButtonElement | null;

describe('BusinessDayTab', () => {
  let restoreConsole: () => void;
  beforeEach(() => {
    closeBusinessDay.mockReset().mockResolvedValue(undefined);
    // Only the noise these tests provoke on purpose; React's act() and
    // unmounted-update warnings must still reach the console.
    restoreConsole = muteExpectedConsoleErrors([
      /not wrapped in act/,
      /Warning: validateDOMNesting/,
    ]);
  });
  afterEach(() => {
    cleanup();
    restoreConsole();
  });

  it('asks for a station before showing anything', () => {
    renderWithProviders(<BusinessDayTab selectedStation={null} userRole="Owner" />);
    expect(screen.getByText(/Please select a station/i)).toBeDefined();
  });

  describe('who may close a day', () => {
    it('offers the close to an owner', async () => {
      renderTab({ userRole: 'Owner' });
      await waitFor(() => expect(closeDayButton()).not.toBeNull());
    });

    it('offers the close to a manager', async () => {
      renderTab({ userRole: 'Manager' });
      await waitFor(() => expect(closeDayButton()).not.toBeNull());
    });

    it('withholds it from an accountant', async () => {
      // Accountants reconcile the day; sealing it is an owner/manager act.
      renderTab({ userRole: 'Accountant' });
      await waitFor(() => expect(screen.getAllByText(/Business Day/i).length).toBeGreaterThan(0));
      expect(closeDayButton()).toBeNull();
    });

    it('withholds it from staff', async () => {
      renderTab({ userRole: 'Staff' });
      await waitFor(() => expect(screen.getAllByText(/Business Day/i).length).toBeGreaterThan(0));
      expect(closeDayButton()).toBeNull();
    });
  });

  describe('when a day may be closed', () => {
    it('does not offer the close on an already-closed day', async () => {
      renderTab({}, { status: 'CLOSED' });
      await waitFor(() => expect(screen.getAllByText(/Business Day/i).length).toBeGreaterThan(0));
      expect(closeDayButton()).toBeNull();
    });

    it('refuses while a shift is still open on that day', async () => {
      // Closing under an open shift would seal a day whose takings are still
      // being collected.
      renderTab(
        {},
        { activeShift: { id: 'shift-1', businessDayId: 'bd-1', templateName: 'Morning' } },
      );
      await waitFor(() => expect(closeDayButton()).not.toBeNull());
      expect(closeDayButton()!.disabled).toBe(true);
      expect(closeDayButton()!.getAttribute('title')).toMatch(/Close the active shift/i);
    });

    it('allows it when the open shift belongs to a different day', async () => {
      renderTab(
        {},
        { activeShift: { id: 'shift-9', businessDayId: 'bd-other', templateName: 'Night' } },
      );
      await waitFor(() => expect(closeDayButton()).not.toBeNull());
      expect(closeDayButton()!.disabled).toBe(false);
    });
  });

  describe('following a requested business date', () => {
    // Guards the effect that adopts `requestedBusinessDate` — the deep link
    // from the top-bar business-day pill. A fix that ran it only on mount would
    // leave the operator looking at the wrong day's figures while the close
    // button seals the one behind it.
    it('reports the requested date as consumed so the deep link is released', async () => {
      const onBusinessDateSelected = vi.fn();
      renderTab({ requestedBusinessDate: TODAY, onBusinessDateSelected });
      await waitFor(() => expect(onBusinessDateSelected).toHaveBeenCalled());
    });

    it('adopts a date requested after mount, not only the one it started with', async () => {
      const onBusinessDateSelected = vi.fn();
      const { rerender } = renderTab({ onBusinessDateSelected });
      await waitFor(() => expect(closeDayButton()).not.toBeNull());
      expect(onBusinessDateSelected).not.toHaveBeenCalled();

      rerender(
        <BusinessDayTab
          selectedStation={STATION}
          userRole="Owner"
          requestedBusinessDate={TODAY}
          onBusinessDateSelected={onBusinessDateSelected}
        />,
      );
      await waitFor(() => expect(onBusinessDateSelected).toHaveBeenCalled());
    });
  });

  describe('closing the day', () => {
    it('seals the day only after the operator confirms', async () => {
      renderTab();
      await waitFor(() => expect(closeDayButton()).not.toBeNull());
      fireEvent.click(closeDayButton()!);

      await waitFor(() => expect(screen.getByText('Close this business day?')).toBeDefined());
      expect(closeBusinessDay).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Close day' }));
      await waitFor(() => expect(closeBusinessDay).toHaveBeenCalledWith('bd-1', STATION.id));
    });

    it('does not seal the day if the operator backs out', async () => {
      renderTab();
      await waitFor(() => expect(closeDayButton()).not.toBeNull());
      fireEvent.click(closeDayButton()!);

      await waitFor(() => expect(screen.getByText('Close this business day?')).toBeDefined());
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => expect(screen.queryByText('Close this business day?')).toBeNull());
      expect(closeBusinessDay).not.toHaveBeenCalled();
    });

    it('warns that the snapshot is immutable and names the date', async () => {
      renderTab();
      await waitFor(() => expect(closeDayButton()).not.toBeNull());
      fireEvent.click(closeDayButton()!);
      await waitFor(() =>
        expect(screen.getByText(new RegExp(`immutable DSSR snapshot for ${TODAY}`))).toBeDefined(),
      );
    });
  });
});

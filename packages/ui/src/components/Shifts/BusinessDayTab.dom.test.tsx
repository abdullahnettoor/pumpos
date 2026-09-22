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
  recentBusinessDays?: Record<string, unknown>[];
};

const renderTab = (props: Record<string, unknown> = {}, seed: Seed = {}) => {
  const {
    status = 'OPEN',
    businessDayId = 'bd-1',
    snapshotData = { businessDayId },
    activeShift = null,
    openBusinessDays = [{ businessDate: TODAY, id: businessDayId }],
    recentBusinessDays = openBusinessDays.map((d) => ({
      ...d,
      status: 'OPEN',
      openShiftCount: 0,
      closedShiftCount: 0,
      lastActivityAt: '2026-03-01T12:00:00.000Z',
    })),
  } = seed;
  const client = createTestQueryClient();
  const statusPayload = {
    requestedState: status,
    openBusinessDays,
    requestedBusinessDay: { id: businessDayId, businessDate: TODAY },
    recentBusinessDays,
    recentFromBusinessDate: '2026-02-16',
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

    it('lets the operator pick a different day even if the request is never cleared', async () => {
      // `onBusinessDateSelected` is omitted, so the requested date stays set.
      // It must not out-vote an explicit click.
      renderTab({
        requestedBusinessDate: '2026-02-27',
        openBusinessDays: [
          { businessDate: TODAY, id: 'bd-1' },
          { businessDate: '2026-02-27', id: 'bd-old' },
        ],
      });
      const dayButtons = await screen.findAllByRole('button', { pressed: false });
      const today = dayButtons.find((b) => b.textContent?.includes('01'));
      if (today) {
        fireEvent.click(today);
        await waitFor(() =>
          expect(
            screen.getAllByRole('button').some((b) => b.getAttribute('aria-pressed') === 'true'),
          ).toBe(true),
        );
      }
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

  describe('the recent business days list (#226)', () => {
    const day = (over: Record<string, unknown>) => ({
      id: 'bd-x',
      businessDate: '2026-02-24',
      status: 'CLOSED',
      openShiftCount: 0,
      closedShiftCount: 3,
      lastActivityAt: '2026-02-24T18:00:00.000Z',
      ...over,
    });

    it('lists a CLOSED day, which the open-days-only panel could never show', async () => {
      renderTab({}, { recentBusinessDays: [day({ businessDate: '2026-02-24' })] });
      // The selected date also appears in the tab's own header, so scope to
      // the list row itself.
      await waitFor(() =>
        expect(screen.getAllByRole('button', { name: /24 Feb 2026/i }).length).toBeGreaterThan(0),
      );
    });

    it('marks a day’s status with a chip, distinct from its counts text', async () => {
      // `getAllByText(/Closed/i)` would also match "3 closed · 0 open", so the
      // chip could be deleted and the test still pass. Match the chip's own
      // exact-cased label node instead.
      renderTab({}, { recentBusinessDays: [day({ status: 'CLOSED' })] });
      await waitFor(() =>
        expect(screen.getAllByText((_, el) => el?.textContent === 'Closed').length).toBeGreaterThan(
          0,
        ),
      );
    });

    it('renders each day’s shift counts (the #225-corrected values)', async () => {
      renderTab({}, { recentBusinessDays: [day({ closedShiftCount: 3, openShiftCount: 1 })] });
      await waitFor(() => expect(screen.getByText(/3 closed · 1 open/i)).toBeDefined());
    });

    it('selecting a closed day moves the view to that date', async () => {
      renderTab({}, { recentBusinessDays: [day({ businessDate: '2026-02-24' })] });
      const [row] = await screen.findAllByRole('button', { name: /24 Feb 2026/i });
      fireEvent.click(row);
      await waitFor(() => expect(row.getAttribute('aria-pressed')).toBe('true'));
    });

    it('offers "See older" and sends it to the reports page', async () => {
      const onNavigate = vi.fn();
      renderTab({ onNavigate }, { recentBusinessDays: [day({})] });
      const older = await screen.findByRole('button', { name: /See older/i });
      fireEvent.click(older);
      expect(onNavigate).toHaveBeenCalledWith('/reports');
    });

    it.each(['Owner', 'Manager', 'Accountant'] as const)(
      'offers "See older" to %s, who may open Reports',
      async (userRole) => {
        const onNavigate = vi.fn();
        renderTab({ onNavigate, userRole }, { recentBusinessDays: [day({})] });
        expect(await screen.findByRole('button', { name: /See older/i })).toBeDefined();
      },
    );

    it('hides "See older" from Staff, whose nav has no Reports page', async () => {
      // Routing them there lands on a page their own nav does not list and
      // whose reads refuse them — worse than not offering it.
      const onNavigate = vi.fn();
      renderTab({ onNavigate, userRole: 'Staff' }, { recentBusinessDays: [day({})] });
      await screen.findAllByRole('button', { name: /24 Feb 2026/i });
      expect(screen.queryByRole('button', { name: /See older/i })).toBeNull();
    });

    it('names the window start when it is genuinely empty', async () => {
      // Read from the payload, not restated in the UI, so the message cannot
      // drift from the window the server actually applied.
      renderTab({}, { recentBusinessDays: [], openBusinessDays: [] });
      await waitFor(() =>
        expect(screen.getByText(/No Business Days since 16 Feb 2026/i)).toBeDefined(),
      );
    });
  });

  /**
   * The acceptance criterion in full: a closed day must not merely be listed,
   * it must open its stored DSSR snapshot. The distinction is visible — an
   * open day is composed live and flagged "Live"; a closed day reads the
   * immutable snapshot and must not be.
   */
  it('opens a closed day’s stored snapshot, not a live composition', async () => {
    const CLOSED_DATE = '2026-02-24';
    const client = createTestQueryClient();
    const recent = [
      {
        id: 'bd-closed',
        businessDate: CLOSED_DATE,
        status: 'CLOSED',
        openShiftCount: 0,
        closedShiftCount: 3,
        lastActivityAt: '2026-02-24T18:00:00.000Z',
      },
    ];
    client.setQueryData(queryKeys.businessDayStatus(STATION.id, TODAY), {
      requestedState: 'OPEN',
      openBusinessDays: [],
      recentBusinessDays: recent,
      requestedBusinessDay: { id: 'bd-1', businessDate: TODAY },
    });
    client.setQueryData(queryKeys.businessDayStatus(STATION.id, ''), {
      requestedState: 'OPEN',
      openBusinessDays: [],
      recentBusinessDays: recent,
      requestedBusinessDay: { id: 'bd-1', businessDate: TODAY },
    });
    client.setQueryData(queryKeys.dssrPreview(STATION.id, TODAY), {
      snapshotData: { businessDayId: 'bd-1' },
      live: true,
      generatedAt: '2026-03-01T12:00:00.000Z',
    });
    // The closed day's own status + its stored snapshot.
    client.setQueryData(queryKeys.businessDayStatus(STATION.id, CLOSED_DATE), {
      requestedState: 'CLOSED',
      openBusinessDays: [],
      recentBusinessDays: recent,
      requestedBusinessDay: { id: 'bd-closed', businessDate: CLOSED_DATE },
    });
    client.setQueryData(queryKeys.dssr(STATION.id, CLOSED_DATE), {
      snapshotData: { businessDayId: 'bd-closed' },
      generatedAt: '2026-02-25T02:00:00.000Z',
    });
    client.setQueryData(queryKeys.shiftStatus(STATION.id, true), { activeShift: null });
    client.setQueryData(queryKeys.customers(true), []);

    renderWithProviders(<BusinessDayTab selectedStation={STATION} userRole="Owner" />, {
      queryClient: client,
    });

    // Today is open and composed live — so the absence of "Live" after the
    // click is a real change, not a vacuous assertion.
    await waitFor(() => expect(screen.getByText(/^Live/)).toBeDefined());

    const [row] = await screen.findAllByRole('button', { name: /24 Feb 2026/i });
    fireEvent.click(row);

    await waitFor(() => expect(screen.getAllByText(/Closed/i).length).toBeGreaterThan(0));
    // A stored snapshot is never "Live".
    expect(screen.queryByText(/^Live/)).toBeNull();
    // ...and a closed day offers no close button.
    expect(closeDayButton()).toBeNull();
  });
});

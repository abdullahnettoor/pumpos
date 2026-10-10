// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * The Attendant app is the whole product for a pump attendant: their handover
 * and nothing else. These pin its three states (no shift, form, recorded) and
 * that no other screen or navigation is reachable from it.
 *
 * The screen and the handover form read everything through `@pump/ui` hooks, so
 * that package is the mock seam.
 */
const mutateAsync = vi.fn();
const refetch = vi.fn(() => Promise.resolve());
const assignment: {
  data: unknown;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
} = { data: null, isLoading: false, isFetching: false, isError: false, refetch };
const merchHandovers: { data: unknown[] } = { data: [] };

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useMyAssignment: () => assignment,
    useStations: () => ({ data: [{ id: 'station-1', name: 'Highway Fuels' }] }),
    useProducts: () => ({ data: [] }),
    useCustomers: () => ({ data: [] }),
    useAllVehicles: () => ({ data: [] }),
    useInventoryItems: () => ({ data: [] }),
    useMerchandiseHandovers: () => merchHandovers,
    useRecordHandoverMutation: () => ({ mutateAsync, isPending: false }),
    CloudTransactionService: class {
      recordMerchandiseHandover = vi.fn();
      recordCollection = vi.fn();
      voidCreditSale = vi.fn();
      voidOmcCardSale = vi.fn();
    },
    runTask: (p: Promise<unknown>) => p.catch(() => {}),
  };
});

vi.mock('../components/CashCountSheet.js', () => ({ CashCountSheet: () => null }));

const { AttendantScreen } = await import('./AttendantScreen.js');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');

const NOZZLE = '33333333-3333-4333-8333-333333333333';

const resultFor = (payload: any, over: Record<string, unknown> = {}) => ({
  handover: {
    id: 'handover-1',
    shiftId: payload.shiftId,
    attendantId: payload.userId,
    duId: payload.duId,
    cashHandedOver: String(payload.cashHandedOver ?? 0),
    cardHandedOver: String(payload.cardHandedOver ?? 0),
    upiHandedOver: String(payload.upiHandedOver ?? 0),
    creditHandedOver: '0',
    testingVolume: '0',
    expectedSales: '0',
    openingFloat: '2000',
    cashDrops: String(payload.cashDrops ?? 0),
    expectedCash: '5000',
    varianceAmount: '0',
    createdAt: '2026-03-01T12:00:00.000Z',
  },
  terminalEntries: [],
  nozzleReadings: (payload.nozzleReadings ?? []).map((r: any, i: number) => ({
    id: `hr-${i}`,
    nozzleId: r.nozzleId,
    openingReading: 1000,
    closingReading: Number(r.closingReading ?? 0),
    grossVolume: Number(r.closingReading ?? 0) - 1000,
    testingVolume: Number(r.testingVolume ?? 0),
    netVolume: Number(r.closingReading ?? 0) - 1000,
    unitPrice: 100,
    expectedSales: 0,
  })),
  expectedFuelSales: 5000,
  merchandiseCash: 0,
  expectedSales: 5000,
  expectedTotal: 5000,
  creditSales: 0,
  omcCardSales: 0,
  declaredTotal: Number(payload.cashHandedOver ?? 0),
  openingFloat: 2000,
  cashDrops: Number(payload.cashDrops ?? 0),
  expectedCash: 5000,
  varianceAmount: 0,
  replaced: false,
  ...over,
});

const makeAssignment = (over: { du?: Record<string, unknown> } & Record<string, unknown> = {}) => {
  const { du, ...rest } = over;
  return {
    userId: 'att-1',
    station: { id: 'station-1', name: 'Highway Fuels' },
    shift: {
      id: 'shift-1',
      templateName: 'Shift 2',
      stationId: 'station-1',
      openedAt: new Date(Date.now() - 192 * 60_000).toISOString(),
    },
    stationHasConfiguredTerminals: false,
    dispenserUnits: [
      {
        duId: 'du-1',
        duName: 'DU2',
        duCode: null,
        openingFloat: 2000,
        nozzles: [
          {
            nozzleId: NOZZLE,
            nozzleName: 'N1',
            productId: 'prod-1',
            productName: 'Petrol',
            unit: 'L',
            unitPrice: 100,
            openingReading: 1000,
          },
        ],
        terminals: [],
        creditSales: [],
        omcSales: [],
        ...du,
      },
    ],
    ...rest,
  };
};

const RECORDED_HANDOVER = {
  cashHandedOver: '12254',
  cardHandedOver: '0',
  upiHandedOver: '0',
  creditHandedOver: '0',
  openingFloat: '2000',
  cashDrops: '20000',
  expectedCash: '12254',
  varianceAmount: '-125',
  createdAt: '2026-10-09T16:34:00.000Z',
};

const renderScreen = (onSignOut = vi.fn()) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AttendantScreen userName="Sajid P" onSignOut={onSignOut} />
    </QueryClientProvider>,
  );
  return { onSignOut };
};

describe('AttendantScreen', () => {
  beforeEach(() => {
    mutateAsync
      .mockReset()
      .mockImplementation(({ payload }: { payload: never }) => Promise.resolve(resultFor(payload)));
    refetch.mockClear();
    Object.assign(assignment, { data: null, isLoading: false, isFetching: false, isError: false });
    merchHandovers.data = [];
  });
  afterEach(cleanup);

  it('names the Station and the attendant in the header', () => {
    assignment.data = makeAssignment();
    renderScreen();
    expect(screen.getByRole('heading', { level: 1, name: 'Highway Fuels' })).toBeDefined();
    expect(screen.getByText('Sajid P · Attendant')).toBeDefined();
  });

  describe('no shift assigned', () => {
    it('explains, and Refresh re-reads the assignment', () => {
      renderScreen();
      expect(screen.getByText('No shift assigned')).toBeDefined();
      expect(screen.queryByRole('button', { name: /Save handover/i })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('still names the Station from the stations list', () => {
      renderScreen();
      expect(screen.getByRole('heading', { level: 1, name: 'Highway Fuels' })).toBeDefined();
    });

    it('shows progress while loading', () => {
      assignment.isLoading = true;
      renderScreen();
      expect(screen.getByText(/Loading your shift/i)).toBeDefined();
    });

    it('says so when the assignment could not be loaded', () => {
      assignment.isError = true;
      renderScreen();
      expect(screen.getByText("Couldn't load your shift")).toBeDefined();
    });
  });

  describe('handover form', () => {
    beforeEach(() => {
      assignment.data = makeAssignment();
    });

    it('shows the DU strip: pump, Shift, nozzles and time on shift', () => {
      renderScreen();
      const strip = screen.getByRole('status', { name: 'Your dispenser unit' });
      expect(within(strip).getByText("You're on DU2")).toBeDefined();
      expect(within(strip).getByText('Shift 2 · N1')).toBeDefined();
      expect(within(strip).getByText('3h 12m')).toBeDefined();
    });

    it('renders the redesigned handover form with the single Save bar', () => {
      renderScreen();
      expect(screen.getByLabelText(/N1 · Petrol/)).toBeDefined();
      expect(screen.getAllByRole('button', { name: /Save handover/i })).toHaveLength(1);
    });

    it('records the handover, then shows the recorded state with their summary', async () => {
      renderScreen();
      fireEvent.change(screen.getByLabelText(/N1 · Petrol/), { target: { value: '1050' } });
      fireEvent.change(screen.getByLabelText(/^Cash \(₹\)/), { target: { value: '5000' } });
      fireEvent.click(screen.getByRole('button', { name: /Save handover/i }));

      await screen.findByText('Handover recorded');
      expect(mutateAsync).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Your summary')).toBeDefined();
      expect(screen.getByText('Fuel sold')).toBeDefined();
      expect(screen.getByText('50 L')).toBeDefined();
      expect(screen.getByText('Cash handed over')).toBeDefined();
      expect(screen.getByText('Balanced')).toBeDefined();
      expect(screen.queryByRole('button', { name: /Save handover/i })).toBeNull();
    });
  });

  describe('handover recorded', () => {
    beforeEach(() => {
      assignment.data = makeAssignment({
        du: {
          handover: RECORDED_HANDOVER,
          nozzles: [
            {
              nozzleId: NOZZLE,
              nozzleName: 'N1',
              productId: 'prod-1',
              productName: 'Petrol',
              unit: 'L',
              unitPrice: 100,
              openingReading: 1000,
              closingReading: 1100,
              testingVolume: 0,
            },
          ],
        },
      });
      merchHandovers.data = [
        {
          attendantId: 'att-1',
          totalAmount: '1080',
          items: [{ quantity: '2' }, { quantity: '1' }],
        },
      ];
    });

    it('shows on reload, from the Handover the assignment holds', () => {
      renderScreen();
      expect(screen.getByText('Handover recorded')).toBeDefined();
      expect(screen.getByText('100 L')).toBeDefined();
      expect(screen.getByText('3 items')).toBeDefined();
      expect(screen.getByText('Short ₹125')).toBeDefined();
      expect(screen.getByText('includes ₹2,000.00 float')).toBeDefined();
      expect(screen.queryByRole('button', { name: /Save handover/i })).toBeNull();
    });

    it('offers to edit until the Shift closes, bringing the form back', () => {
      renderScreen();
      fireEvent.click(screen.getByRole('button', { name: 'Edit before shift closes' }));
      expect(screen.queryByText('Handover recorded')).toBeNull();
      expect(screen.getByRole('button', { name: /Save handover/i })).toBeDefined();
      // The form is seeded from what was recorded.
      expect((screen.getByLabelText(/^Cash \(₹\)/) as HTMLInputElement).value).toBe('12254');
    });
  });

  describe('account sheet', () => {
    beforeEach(() => {
      assignment.data = makeAssignment();
    });

    it('shows who they are, where, and only Sign out', () => {
      renderScreen();
      expect(screen.queryByRole('dialog')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Account' }));
      const sheet = screen.getByRole('dialog', { name: 'Account' });
      expect(within(sheet).getByText('Sajid P')).toBeDefined();
      expect(within(sheet).getByText('Attendant · Highway Fuels')).toBeDefined();
      expect(
        within(sheet)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Sign out']);
    });

    it('signs out from the sheet', () => {
      const { onSignOut } = renderScreen();
      fireEvent.click(screen.getByRole('button', { name: 'Account' }));
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      expect(onSignOut).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape', async () => {
      renderScreen();
      fireEvent.click(screen.getByRole('button', { name: 'Account' }));
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
  });

  describe('no other screens', () => {
    const FORBIDDEN =
      /^(home|shifts?|reports?|money|insights?|alerts?|notifications?|more|overview|daily report|ledger|my handover)$/i;

    it.each([
      ['no shift', () => undefined],
      ['the form', () => (assignment.data = makeAssignment())],
      [
        'recorded',
        () => (assignment.data = makeAssignment({ du: { handover: RECORDED_HANDOVER } })),
      ],
    ])('has no navigation, dock or other destinations (%s)', (_name, setup) => {
      setup();
      renderScreen();
      expect(screen.queryByRole('navigation')).toBeNull();
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
      expect(screen.queryAllByRole('link')).toHaveLength(0);
      for (const button of screen.getAllByRole('button')) {
        const name = button.getAttribute('aria-label') ?? button.textContent ?? '';
        expect(name.trim()).not.toMatch(FORBIDDEN);
      }
    });
  });
});

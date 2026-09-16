// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * The mobile handover is what an attendant actually submits at the end of a
 * shift, from a phone, usually in a hurry. Its payload deliberately differs
 * from the desktop drawer — it drops empty terminal entries, carries a
 * `batchRef`, and omits `duId` — and those differences are easy to "tidy" into
 * a break during a refactor. These pin them.
 *
 * `HandoverPanel` takes no props at all: everything arrives through hooks from
 * `@pump/ui`, so that package is the mock seam.
 */
const mutateAsync = vi.fn();
const recordMerchandiseHandover = vi.fn();
const assignment: { data: unknown; isLoading: boolean } = { data: null, isLoading: false };
const merchHandovers: { data: unknown[] } = { data: [] };
const products: { data: unknown[] } = { data: [] };

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useMyAssignment: () => assignment,
    useProducts: () => products,
    useCustomers: () => ({ data: [] }),
    useAllVehicles: () => ({ data: [] }),
    useInventoryItems: () => ({ data: [] }),
    useMerchandiseHandovers: () => merchHandovers,
    useRecordHandoverMutation: () => ({ mutateAsync, isPending: false }),
    CloudTransactionService: class {
      recordMerchandiseHandover = (...a: unknown[]) => recordMerchandiseHandover(...a);
      recordCollection = vi.fn();
      voidCreditSale = vi.fn();
      voidOmcCardSale = vi.fn();
    },
    runTask: (p: Promise<unknown>) => p.catch(() => {}),
  };
});

vi.mock('./CashCountSheet.js', () => ({ CashCountSheet: () => null }));

const { HandoverPanel } = await import('./HandoverPanel.js');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');

const NOZZLE = '33333333-3333-4333-8333-333333333333';

/**
 * A faithful `RecordHandoverResult` echo. The panel reads
 * `result.handover.cashHandedOver` after a save, so a partial stub throws
 * inside a state updater — which vitest reports as an unhandled error while
 * still showing the test green. Kept local rather than imported from @pump/ui:
 * a test double does not belong in the product's public API.
 */
const handoverResultFor = (payload: any) => ({
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
    varianceAmount: '0',
    createdAt: '2026-03-01T12:00:00.000Z',
  },
  terminalEntries: (payload.terminalEntries ?? []).map((t: any, i: number) => ({
    id: `te-${i}`,
    handoverId: 'handover-1',
    terminalId: t.terminalId,
    duId: 'du-1',
    cardAmount: String(t.cardAmount ?? 0),
    upiAmount: String(t.upiAmount ?? 0),
    batchRef: t.batchRef ?? null,
    createdAt: '2026-03-01T12:00:00.000Z',
  })),
  nozzleReadings: (payload.nozzleReadings ?? []).map((r: any, i: number) => ({
    id: `hr-${i}`,
    nozzleId: r.nozzleId,
    openingReading: 0,
    closingReading: Number(r.closingReading ?? 0),
    grossVolume: Number(r.closingReading ?? 0),
    testingVolume: Number(r.testingVolume ?? 0),
    netVolume: 0,
    unitPrice: 0,
    expectedSales: 0,
  })),
  expectedFuelSales: 0,
  merchandiseCash: 0,
  expectedSales: 0,
  expectedTotal: 0,
  creditSales: 0,
  omcCardSales: 0,
  declaredTotal: Number(payload.cashHandedOver ?? 0),
  varianceAmount: 0,
  replaced: false,
});

const withClient = (ui: React.ReactElement) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrap = (node: React.ReactElement) => (
    <QueryClientProvider client={client}>{node}</QueryClientProvider>
  );
  const result = render(wrap(ui));
  return { ...result, rerender: (node: React.ReactElement) => result.rerender(wrap(node)) };
};

const makeAssignment = (over: Record<string, unknown> = {}) => ({
  userId: 'att-1',
  station: { id: 'station-1', name: 'Test RO' },
  shift: { id: 'shift-1', templateName: 'Morning', stationId: 'station-1' },
  stationHasConfiguredTerminals: false,
  dispenserUnits: [
    {
      duId: 'du-1',
      duName: 'DU 1',
      duCode: 'DU-1',
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
    },
  ],
  ...over,
});

const save = () => fireEvent.click(screen.getByRole('button', { name: /Save handover/i }));

describe('HandoverPanel (mobile)', () => {
  let restoreConsole: () => void;
  beforeEach(() => {
    // Faithful echo: the panel reads result.handover.cashHandedOver after a
    // save. A partial stub throws inside a state updater, which vitest surfaces
    // as an unhandled error while still reporting the test green.
    mutateAsync
      .mockReset()
      .mockImplementation(({ payload }: { payload: never }) =>
        Promise.resolve(handoverResultFor(payload)),
      );
    recordMerchandiseHandover.mockReset();
    assignment.data = null;
    assignment.isLoading = false;
    merchHandovers.data = [];
    products.data = [];
    // Only the noise these tests provoke on purpose; React's act() and
    // unmounted-update warnings must still reach the console.
    const original = console.error;
    console.error = (...args: unknown[]) => {
      if (/not wrapped in act/.test(args.map(String).join(' '))) return;
      original(...(args as []));
    };
    restoreConsole = () => {
      console.error = original;
    };
  });
  afterEach(() => {
    cleanup();
    restoreConsole();
  });

  describe('without an assignment', () => {
    it('says so rather than showing an empty form', () => {
      withClient(<HandoverPanel />);
      expect(screen.getByText(/No open shift assigned to you/i)).toBeDefined();
    });

    it('shows progress while the assignment is still loading', () => {
      assignment.isLoading = true;
      withClient(<HandoverPanel />);
      expect(screen.getByText(/Loading your shift/i)).toBeDefined();
    });
  });

  describe('submitted payload', () => {
    beforeEach(() => {
      assignment.data = makeAssignment();
    });

    it('sends the readings and cash for the assigned dispenser unit', async () => {
      withClient(<HandoverPanel />);
      await waitFor(() => expect(screen.getByLabelText(/N1 · Petrol/)).toBeDefined());

      fireEvent.change(screen.getByLabelText(/N1 · Petrol/), { target: { value: '1050' } });
      fireEvent.change(screen.getByLabelText(/Cash/), { target: { value: '5000' } });
      save();

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      const { payload } = mutateAsync.mock.calls[0][0];
      expect(payload.shiftId).toBe('shift-1');
      expect(payload.userId).toBe('att-1');
      expect(payload.duId).toBe('du-1');
      expect(payload.cashHandedOver).toBe(5000);
      expect(payload.nozzleReadings).toEqual([
        { nozzleId: NOZZLE, closingReading: 1050, testingVolume: 0 },
      ]);
    });

    it('sends the testing volume alongside the closing reading', async () => {
      withClient(<HandoverPanel />);
      await waitFor(() => expect(screen.getByLabelText(/N1 · Petrol/)).toBeDefined());
      fireEvent.change(screen.getByLabelText(/N1 · Petrol/), { target: { value: '1050' } });
      fireEvent.change(screen.getByLabelText(/Testing/), { target: { value: '5' } });
      fireEvent.change(screen.getByLabelText(/Cash/), { target: { value: '4500' } });
      save();

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      expect(mutateAsync.mock.calls[0][0].payload.nozzleReadings[0].testingVolume).toBe(5);
    });

    it('carries aggregate card and UPI when the station runs no terminals', async () => {
      withClient(<HandoverPanel />);
      await waitFor(() => expect(screen.getByLabelText(/N1 · Petrol/)).toBeDefined());
      fireEvent.change(screen.getByLabelText(/N1 · Petrol/), { target: { value: '1050' } });
      fireEvent.change(screen.getByLabelText(/Cash/), { target: { value: '3000' } });
      fireEvent.change(screen.getByLabelText('Card'), { target: { value: '1500' } });
      fireEvent.change(screen.getByLabelText('UPI'), { target: { value: '500' } });
      save();

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      const { payload } = mutateAsync.mock.calls[0][0];
      expect(payload.cardHandedOver).toBe(1500);
      expect(payload.upiHandedOver).toBe(500);
      expect(payload.terminalEntries).toBeUndefined();
    });

    it('omits aggregate card and UPI once the station runs terminals', async () => {
      assignment.data = makeAssignment({ stationHasConfiguredTerminals: true });
      withClient(<HandoverPanel />);
      await waitFor(() => expect(screen.getByLabelText(/N1 · Petrol/)).toBeDefined());
      fireEvent.change(screen.getByLabelText(/N1 · Petrol/), { target: { value: '1050' } });
      fireEvent.change(screen.getByLabelText(/Cash/), { target: { value: '5000' } });
      save();

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      const { payload } = mutateAsync.mock.calls[0][0];
      expect('cardHandedOver' in payload).toBe(false);
      expect('upiHandedOver' in payload).toBe(false);
    });
  });

  describe('terminal entries', () => {
    const withTerminals = () =>
      makeAssignment({
        stationHasConfiguredTerminals: true,
        dispenserUnits: [
          {
            ...makeAssignment().dispenserUnits[0],
            terminals: [
              { terminalId: 'term-1', label: 'POS 1', supportsCard: true, supportsUpi: true },
              { terminalId: 'term-2', label: 'POS 2', supportsCard: true, supportsUpi: true },
            ],
          },
        ],
      });

    it('drops terminals that settled nothing, unlike the desktop drawer', async () => {
      assignment.data = withTerminals();
      withClient(<HandoverPanel />);
      await waitFor(() => expect(screen.getByLabelText(/N1 · Petrol/)).toBeDefined());
      fireEvent.change(screen.getByLabelText(/N1 · Petrol/), { target: { value: '1050' } });
      fireEvent.change(screen.getByLabelText(/Cash/), { target: { value: '4000' } });
      fireEvent.change(screen.getAllByLabelText('Card')[0], { target: { value: '1000' } });
      save();

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      const { payload } = mutateAsync.mock.calls[0][0];
      expect(payload.terminalEntries).toHaveLength(1);
      expect(payload.terminalEntries[0].terminalId).toBe('term-1');
      expect(payload.terminalEntries[0].cardAmount).toBe(1000);
    });

    it('carries a batchRef and no duId on each terminal entry', async () => {
      // The desktop drawer is the mirror image: duId, no batchRef. Both server
      // shapes are live, so neither may drift into the other.
      assignment.data = withTerminals();
      withClient(<HandoverPanel />);
      await waitFor(() => expect(screen.getByLabelText(/N1 · Petrol/)).toBeDefined());
      fireEvent.change(screen.getByLabelText(/N1 · Petrol/), { target: { value: '1050' } });
      fireEvent.change(screen.getByLabelText(/Cash/), { target: { value: '4000' } });
      fireEvent.change(screen.getAllByLabelText('Card')[0], { target: { value: '1000' } });
      save();

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      const entry = mutateAsync.mock.calls[0][0].payload.terminalEntries[0];
      expect('batchRef' in entry).toBe(true);
      expect('duId' in entry).toBe(false);
    });
  });

  describe('seeding from the assignment', () => {
    // Guards the two effects #63 will touch: the form seed with its
    // anti-clobber guard, and the merchandise pre-fill.
    it('pre-fills each nozzle with its opening reading', async () => {
      assignment.data = makeAssignment();
      withClient(<HandoverPanel />);
      await waitFor(() =>
        expect((screen.getByLabelText(/N1 · Petrol/) as HTMLInputElement).value).toBe('1000'),
      );
    });

    it('does not clobber figures the attendant has already typed', async () => {
      // The assignment refetches after adding a credit line; a re-seed mid-entry
      // would wipe the cash being counted.
      assignment.data = makeAssignment();
      const { rerender } = withClient(<HandoverPanel />);
      await waitFor(() => expect(screen.getByLabelText(/N1 · Petrol/)).toBeDefined());
      fireEvent.change(screen.getByLabelText(/N1 · Petrol/), { target: { value: '1050' } });
      fireEvent.change(screen.getByLabelText(/Cash/), { target: { value: '5000' } });

      assignment.data = makeAssignment();
      rerender(<HandoverPanel />);

      expect((screen.getByLabelText(/N1 · Petrol/) as HTMLInputElement).value).toBe('1050');
      expect((screen.getByLabelText(/Cash/) as HTMLInputElement).value).toBe('5000');
    });

    it('pre-fills a merchandise closing this attendant already recorded', async () => {
      // The server replaces the whole handover on each save, so a missing
      // pre-fill would wipe merchandise the attendant had already declared.
      products.data = [{ id: 'prod-oil', name: 'Engine Oil', unit: 'unit' }];
      merchHandovers.data = [
        {
          attendantId: 'att-1',
          items: [{ productId: 'prod-oil', quantity: 3 }],
          nonCashAmount: 250,
        },
      ];
      assignment.data = makeAssignment();
      withClient(<HandoverPanel />);
      await waitFor(() =>
        expect((screen.getByLabelText(/Paid by card \/ UPI/) as HTMLInputElement).value).toBe(
          '250',
        ),
      );
    });

    it('ignores a merchandise closing recorded by a different attendant', async () => {
      products.data = [{ id: 'prod-oil', name: 'Engine Oil', unit: 'unit' }];
      merchHandovers.data = [
        {
          attendantId: 'someone-else',
          items: [{ productId: 'prod-oil', quantity: 3 }],
          nonCashAmount: 250,
        },
      ];
      assignment.data = makeAssignment();
      withClient(<HandoverPanel />);
      await waitFor(() => expect(screen.getByLabelText(/N1 · Petrol/)).toBeDefined());
      expect((screen.getByLabelText(/Paid by card \/ UPI/) as HTMLInputElement).value).toBe('');
    });
  });

  describe('validation', () => {
    // The messages from `collectErrors` are not rendered; they gate the save
    // button, so that disabled state is what the attendant actually sees.
    beforeEach(() => {
      assignment.data = makeAssignment();
    });

    const saveButton = () =>
      screen.getByRole('button', { name: /Save handover/i }) as HTMLButtonElement;

    it('refuses a closing reading below the opening reading', async () => {
      withClient(<HandoverPanel />);
      await waitFor(() => expect(screen.getByLabelText(/N1 · Petrol/)).toBeDefined());
      fireEvent.change(screen.getByLabelText(/N1 · Petrol/), { target: { value: '900' } });
      fireEvent.change(screen.getByLabelText(/Cash/), { target: { value: '100' } });

      await waitFor(() => expect(saveButton().disabled).toBe(true));
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('refuses a cleared closing reading', async () => {
      // The field is pre-seeded from the opening reading, so "missing" only
      // arises when the attendant wipes it.
      withClient(<HandoverPanel />);
      await waitFor(() => expect(screen.getByLabelText(/N1 · Petrol/)).toBeDefined());
      fireEvent.change(screen.getByLabelText(/N1 · Petrol/), { target: { value: '' } });
      await waitFor(() => expect(saveButton().disabled).toBe(true));
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('refuses testing volume greater than the volume sold', async () => {
      // Testing fuel is returned to the tank, so it cannot exceed what the
      // meter says was dispensed.
      withClient(<HandoverPanel />);
      await waitFor(() => expect(screen.getByLabelText(/N1 · Petrol/)).toBeDefined());
      fireEvent.change(screen.getByLabelText(/N1 · Petrol/), { target: { value: '1010' } });
      fireEvent.change(screen.getByLabelText(/Testing/), { target: { value: '50' } });
      await waitFor(() => expect(saveButton().disabled).toBe(true));
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('permits the save once the readings are valid', async () => {
      withClient(<HandoverPanel />);
      await waitFor(() => expect(screen.getByLabelText(/N1 · Petrol/)).toBeDefined());
      fireEvent.change(screen.getByLabelText(/N1 · Petrol/), { target: { value: '1050' } });
      fireEvent.change(screen.getByLabelText(/Cash/), { target: { value: '5000' } });
      await waitFor(() => expect(saveButton().disabled).toBe(false));
    });
  });
});

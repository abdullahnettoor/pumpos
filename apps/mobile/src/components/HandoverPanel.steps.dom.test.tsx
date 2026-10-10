// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

/**
 * The redesigned handover: five step cards per DU under a sticky
 * Expected · Declared · Variance strip, one Save handover action. These pin the
 * presentation the payload tests (HandoverPanel.dom.test.tsx) do not cover.
 */
const mutateAsync = vi.fn();
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
      recordMerchandiseHandover = vi.fn();
      recordCollection = vi.fn();
      voidCreditSale = vi.fn();
      voidOmcCardSale = vi.fn();
    },
    runTask: (p: Promise<unknown>) => p.catch(() => {}),
  };
});

vi.mock('./CashCountSheet.js', () => ({
  CashCountSheet: ({ open }: { open: boolean }) => (open ? <div>Cash count sheet</div> : null),
}));

const { HandoverPanel } = await import('./HandoverPanel.js');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');

const NOZZLE = '33333333-3333-4333-8333-333333333333';
const NOZZLE_2 = '44444444-4444-4444-8444-444444444444';

const handoverResultFor = (payload: any, over: Record<string, unknown> = {}) => ({
  handover: {
    id: `handover-${payload.duId}`,
    shiftId: payload.shiftId,
    attendantId: payload.userId,
    duId: payload.duId,
    cashHandedOver: String(payload.cashHandedOver ?? 0),
    cashDrops: String(payload.cashDrops ?? 0),
    cardHandedOver: String(payload.cardHandedOver ?? 0),
    upiHandedOver: String(payload.upiHandedOver ?? 0),
    creditHandedOver: '0',
    testingVolume: '0',
    expectedSales: '0',
    varianceAmount: '0',
    createdAt: '2026-03-01T12:00:00.000Z',
  },
  terminalEntries: [],
  nozzleReadings: (payload.nozzleReadings ?? []).map((r: any, i: number) => ({
    id: `hr-${i}`,
    nozzleId: r.nozzleId,
    openingReading: 0,
    closingReading: Number(r.closingReading ?? 0),
    grossVolume: 0,
    testingVolume: Number(r.testingVolume ?? 0),
    netVolume: 0,
    unitPrice: 0,
    expectedSales: 0,
  })),
  expectedFuelSales: 5000,
  merchandiseCash: 0,
  expectedSales: 5000,
  expectedTotal: 5000,
  creditSales: 0,
  omcCardSales: 0,
  declaredTotal: Number(payload.cashHandedOver ?? 0),
  varianceAmount: -125,
  replaced: false,
  ...over,
});

const withClient = (ui: React.ReactElement) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

const du = (id: string, nozzleId: string, over: Record<string, unknown> = {}) => ({
  duId: id,
  duName: `DU ${id}`,
  duCode: `D-${id}`,
  openingFloat: 0,
  nozzles: [
    {
      nozzleId,
      nozzleName: `N-${id}`,
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
  ...over,
});

const makeAssignment = (over: Record<string, unknown> = {}) => ({
  userId: 'att-1',
  station: { id: 'station-1', name: 'Test RO' },
  shift: { id: 'shift-1', templateName: 'Morning', stationId: 'station-1' },
  stationHasConfiguredTerminals: false,
  dispenserUnits: [du('1', NOZZLE)],
  ...over,
});

const stepHeader = (
  title: RegExp | string,
  scope: ReturnType<typeof within> | typeof screen = screen,
) => scope.getByRole('button', { name: title });
const statusOf = (title: RegExp | string, scope?: ReturnType<typeof within>) =>
  stepHeader(title, scope).closest('section')!.getAttribute('data-step-status');
const strip = () => screen.getByRole('group', { name: 'Handover summary' });
const typeIn = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('HandoverPanel steps (mobile)', () => {
  beforeEach(() => {
    mutateAsync
      .mockReset()
      .mockImplementation(({ payload }: { payload: unknown }) =>
        Promise.resolve(handoverResultFor(payload)),
      );
    assignment.data = makeAssignment();
    assignment.isLoading = false;
    merchHandovers.data = [];
    products.data = [];
  });
  afterEach(cleanup);

  describe('step cards', () => {
    it('shows the five steps of a DU in order', () => {
      withClient(<HandoverPanel />);
      const titles = screen
        .getAllByRole('button')
        .filter((b) => b.hasAttribute('aria-expanded'))
        .map((b) => b.textContent ?? '');
      expect(titles.map((t) => t.split(' — ')[0].replace(/^\d/, ''))).toEqual([
        'Closing readings',
        'Credit & fuel-card sales',
        'Card / UPI',
        'Products sold',
        'Cash handed over',
      ]);
    });

    it('opens the readings first and leaves the rest collapsed', () => {
      withClient(<HandoverPanel />);
      expect(stepHeader(/Closing readings/).getAttribute('aria-expanded')).toBe('true');
      expect(stepHeader(/Cash handed over/).getAttribute('aria-expanded')).toBe('false');
    });

    it('expands and collapses on tap', () => {
      withClient(<HandoverPanel />);
      fireEvent.click(stepHeader(/Cash handed over/));
      expect(stepHeader(/Cash handed over/).getAttribute('aria-expanded')).toBe('true');
      fireEvent.click(stepHeader(/Cash handed over/));
      expect(stepHeader(/Cash handed over/).getAttribute('aria-expanded')).toBe('false');
    });

    it('keeps what was typed when a step is collapsed and re-opened', () => {
      withClient(<HandoverPanel />);
      typeIn(/^Cash \(₹\)/, '5000');
      fireEvent.click(stepHeader(/Cash handed over/));
      fireEvent.click(stepHeader(/Cash handed over/));
      expect((screen.getByLabelText(/^Cash \(₹\)/) as HTMLInputElement).value).toBe('5000');
    });

    it('summarises a collapsed step in one line', () => {
      withClient(<HandoverPanel />);
      typeIn(/N-1 · Petrol/, '1050');
      expect(stepHeader(/Closing readings/).textContent).toContain('N-1 · 50 L net');
    });
  });

  describe('step status', () => {
    it('leaves the readings not started until a closing reading is entered', () => {
      withClient(<HandoverPanel />);
      // The seed fills closing = opening; that is not an answer yet.
      expect(statusOf(/Closing readings/)).toBe('not-started');
      typeIn(/N-1 · Petrol/, '1050');
      expect(statusOf(/Closing readings/)).toBe('done');
    });

    it('counts a closing equal to the opening once the attendant has confirmed it', () => {
      withClient(<HandoverPanel />);
      const field = screen.getByLabelText(/N-1 · Petrol/);
      fireEvent.focus(field);
      fireEvent.blur(field);
      expect(statusOf(/Closing readings/)).toBe('done');
      expect(stepHeader(/Closing readings/).textContent).toContain('no litres yet');
    });

    it('marks the readings in progress while only some nozzles are entered', () => {
      assignment.data = makeAssignment({
        dispenserUnits: [
          du('1', NOZZLE, {
            nozzles: [
              ...du('1', NOZZLE).nozzles,
              { ...du('1', NOZZLE).nozzles[0], nozzleId: NOZZLE_2, nozzleName: 'N-1b' },
            ],
          }),
        ],
      });
      withClient(<HandoverPanel />);
      expect(statusOf(/Closing readings/)).toBe('not-started');
      typeIn(/N-1 · Petrol/, '1050');
      expect(statusOf(/Closing readings/)).toBe('in-progress');
      expect(stepHeader(/Closing readings/).textContent).toContain('1 of 2 nozzles entered');
      typeIn(/N-1b · Petrol/, '1020');
      expect(statusOf(/Closing readings/)).toBe('done');
    });

    it('treats readings the server already holds as entered', () => {
      assignment.data = makeAssignment({
        dispenserUnits: [
          du('1', NOZZLE, {
            nozzles: [{ ...du('1', NOZZLE).nozzles[0], closingReading: 1000 }],
          }),
        ],
      });
      withClient(<HandoverPanel />);
      expect(statusOf(/Closing readings/)).toBe('done');
    });

    it('flags the readings when a closing reading is below its opening', () => {
      withClient(<HandoverPanel />);
      typeIn(/N-1 · Petrol/, '900');
      expect(statusOf(/Closing readings/)).toBe('error');
      expect(stepHeader(/Closing readings/).textContent).toContain('Fix the highlighted readings');
    });

    it('marks the cash step done only once a valid amount is entered', () => {
      withClient(<HandoverPanel />);
      expect(statusOf(/Cash handed over/)).toBe('not-started');
      typeIn(/^Cash \(₹\)/, '5000');
      expect(statusOf(/Cash handed over/)).toBe('done');
    });

    it('treats zero as an answer for the cash step', () => {
      withClient(<HandoverPanel />);
      typeIn(/^Cash \(₹\)/, '0');
      expect(statusOf(/Cash handed over/)).toBe('done');
    });

    it('flags a negative cash amount', () => {
      withClient(<HandoverPanel />);
      typeIn(/^Cash \(₹\)/, '-5');
      expect(statusOf(/Cash handed over/)).toBe('error');
    });

    it('treats credit slips and products as optional', () => {
      withClient(<HandoverPanel />);
      expect(statusOf(/Credit & fuel-card sales/)).toBe('not-started');
      expect(stepHeader(/Credit & fuel-card sales/).textContent).toContain('optional');
      expect(statusOf(/Products sold/)).toBe('not-started');
      expect(stepHeader(/Products sold/).textContent).toContain('optional');
    });

    it('marks credit done when a slip is already recorded', () => {
      assignment.data = makeAssignment({
        dispenserUnits: [
          du('1', NOZZLE, {
            creditSales: [
              { id: 'c1', customerId: 'cu1', customerName: 'KTC', amount: 1000, notes: null },
            ],
          }),
        ],
      });
      withClient(<HandoverPanel />);
      expect(statusOf(/Credit & fuel-card sales/)).toBe('done');
      expect(stepHeader(/Credit & fuel-card sales/).textContent).toContain('1 slip');
    });

    it('marks the card/UPI step done once the aggregate is declared', () => {
      withClient(<HandoverPanel />);
      expect(statusOf(/Card \/ UPI/)).toBe('not-started');
      typeIn('Card', '1500');
      expect(statusOf(/Card \/ UPI/)).toBe('done');
    });

    it('marks products in progress for a line with a quantity but no product', () => {
      withClient(<HandoverPanel />);
      fireEvent.click(stepHeader(/Products sold/));
      fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
      expect(statusOf(/Products sold/)).toBe('in-progress');
    });

    it('steps the product quantity with − and +', () => {
      withClient(<HandoverPanel />);
      fireEvent.click(stepHeader(/Products sold/));
      const qty = () => (screen.getByLabelText('Quantity') as HTMLInputElement).value;
      fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
      fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
      expect(qty()).toBe('2');
      fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }));
      expect(qty()).toBe('1');
      fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }));
      fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }));
      expect(qty()).toBe('');
    });
  });

  describe('Expected · Declared · Variance strip', () => {
    const cell = (label: string) =>
      within(strip()).getByText(label).nextElementSibling!.textContent;

    it('updates live as the attendant types', () => {
      withClient(<HandoverPanel />);
      expect(cell('Expected')).toBe('₹0.00');

      typeIn(/N-1 · Petrol/, '1050'); // 50 L × ₹100
      expect(cell('Expected')).toBe('₹5,000.00');
      expect(cell('Declared')).toBe('₹0.00');
      expect(cell('Variance')).toBe('−₹5,000');

      typeIn(/^Cash \(₹\)/, '4875');
      expect(cell('Declared')).toBe('₹4,875.00');
      expect(cell('Variance')).toBe('−₹125');
      expect(within(strip()).getByText('Live preview')).toBeDefined();
    });

    it('counts the opening float and drops in the variance', () => {
      assignment.data = makeAssignment({
        dispenserUnits: [du('1', NOZZLE, { openingFloat: 2000 })],
      });
      withClient(<HandoverPanel />);
      typeIn(/N-1 · Petrol/, '1050');
      typeIn(/^Cash \(₹\)/, '6500');
      typeIn(/^Cash drops/, '500');
      // Pouch: float 2000 + 5000 sales − 500 drops = 6500.
      expect(cell('Variance')).toBe('Balanced');
    });

    it('is pinned to the top while the steps scroll', () => {
      withClient(<HandoverPanel />);
      expect(strip().className).toContain('sticky');
      expect(strip().className).toContain('top-0');
    });

    it("shows the server's accepted figures after a save", async () => {
      withClient(<HandoverPanel />);
      typeIn(/N-1 · Petrol/, '1050');
      typeIn(/^Cash \(₹\)/, '4875');
      fireEvent.click(screen.getByRole('button', { name: /Save handover/i }));

      await waitFor(() => expect(within(strip()).getByText('Accepted by server')).toBeDefined());
      expect(cell('Expected')).toBe('₹5,000.00');
      expect(cell('Declared')).toBe('₹4,875.00');
      expect(cell('Variance')).toBe('−₹125');
    });

    it('matches the variance shown beside the Save button', async () => {
      withClient(<HandoverPanel />);
      typeIn(/N-1 · Petrol/, '1050');
      typeIn(/^Cash \(₹\)/, '4875');
      const bar = () => screen.getByRole('button', { name: /Save handover/i }).parentElement!;
      expect(bar().textContent).toContain('−₹125');
      fireEvent.click(screen.getByRole('button', { name: /Save handover/i }));
      await waitFor(() => expect(within(strip()).getByText('Accepted by server')).toBeDefined());
      expect(bar().textContent).toContain('−₹125');
    });
  });

  describe('bottom bar', () => {
    it('has a single Save handover action and no draft or submit', () => {
      withClient(<HandoverPanel />);
      expect(screen.getAllByRole('button', { name: /Save handover/i })).toHaveLength(1);
      expect(screen.queryByRole('button', { name: /draft|submit/i })).toBeNull();
    });

    it('stays enabled for another save after one is accepted', async () => {
      withClient(<HandoverPanel />);
      typeIn(/^Cash \(₹\)/, '5000');
      fireEvent.click(screen.getByRole('button', { name: /Save handover/i }));
      await waitFor(() => expect(screen.getByText(/Saved at/)).toBeDefined());
      expect(
        (screen.getByRole('button', { name: /Save handover/i }) as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    it('says which step to fix when the form is invalid', () => {
      withClient(<HandoverPanel />);
      typeIn(/N-1 · Petrol/, '900');
      expect(screen.getByText(/Fix Closing readings to save/)).toBeDefined();
      expect(
        (screen.getByRole('button', { name: /Save handover/i }) as HTMLButtonElement).disabled,
      ).toBe(true);
    });
  });

  describe('cash step', () => {
    it('opens the denomination sheet from Count notes', () => {
      withClient(<HandoverPanel />);
      expect(screen.queryByText('Cash count sheet')).toBeNull();
      fireEvent.click(stepHeader(/Cash handed over/));
      fireEvent.click(screen.getByRole('button', { name: /Count notes/ }));
      expect(screen.getByText('Cash count sheet')).toBeDefined();
    });

    it('explains the expected cash as float + cash sales − drops', () => {
      assignment.data = makeAssignment({
        dispenserUnits: [du('1', NOZZLE, { openingFloat: 2000 })],
      });
      withClient(<HandoverPanel />);
      typeIn(/N-1 · Petrol/, '1050');
      typeIn('Card', '1000');
      typeIn(/^Cash drops/, '500');
      // 2000 float + (5000 − 1000 card) cash sales − 500 drops = 5500.
      const text = screen.getByText(/Expected cash:/).textContent;
      expect(text).toContain('₹5,500.00');
      expect(text).toContain('float ₹2,000.00');
      expect(text).toContain('cash sales ₹4,000.00');
      expect(text).toContain('drops ₹500.00');
    });
  });

  describe('several dispenser units', () => {
    beforeEach(() => {
      assignment.data = makeAssignment({
        dispenserUnits: [du('1', NOZZLE), du('2', NOZZLE_2)],
      });
    });

    it('gives each DU its own step set', () => {
      withClient(<HandoverPanel />);
      expect(screen.getAllByRole('button', { name: /Closing readings/ })).toHaveLength(2);
      expect(screen.getAllByRole('button', { name: /Cash handed over/ })).toHaveLength(2);
      expect(screen.getAllByRole('button', { name: /Card \/ UPI/ })).toHaveLength(2);
    });

    it('records products once, not per DU', () => {
      withClient(<HandoverPanel />);
      expect(screen.getAllByRole('button', { name: /Products sold/ })).toHaveLength(1);
    });

    it('saves one handover per DU from the single Save action', async () => {
      withClient(<HandoverPanel />);
      typeIn(/DU 1 · Cash \(₹\)/, '100');
      typeIn(/DU 2 · Cash \(₹\)/, '200');
      fireEvent.click(screen.getByRole('button', { name: /Save handover/i }));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
      expect(mutateAsync.mock.calls.map((c) => c[0].payload.duId)).toEqual(['1', '2']);
    });
  });

  describe('zero card/UPI with a terminal assigned', () => {
    const terminalDu = () =>
      makeAssignment({
        stationHasConfiguredTerminals: true,
        dispenserUnits: [
          du('1', NOZZLE, {
            terminals: [{ terminalId: 'term-1', label: 'POS 1' }],
          }),
        ],
      });
    const saveBtn = () => screen.getByRole('button', { name: /Save handover/i });

    beforeEach(() => {
      assignment.data = terminalDu();
    });

    it('holds the first save and asks for confirmation', async () => {
      withClient(<HandoverPanel />);
      typeIn(/^Cash \(₹\)/, '5000');
      fireEvent.click(saveBtn());
      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toContain('No card/UPI takings entered'),
      );
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('proceeds once the operator saves again to confirm', async () => {
      withClient(<HandoverPanel />);
      typeIn(/^Cash \(₹\)/, '5000');
      fireEvent.click(saveBtn());
      await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
      fireEvent.click(saveBtn());
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    });

    it('does not ask when something is declared for the terminal', async () => {
      withClient(<HandoverPanel />);
      typeIn(/^Cash \(₹\)/, '5000');
      typeIn('Card', '1000');
      fireEvent.click(saveBtn());
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    });

    it('asks again if the terminal amounts are touched after confirming', async () => {
      withClient(<HandoverPanel />);
      typeIn(/^Cash \(₹\)/, '5000');
      fireEvent.click(saveBtn());
      await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
      // Enter an amount, then clear it again: the earlier "yes" no longer stands.
      typeIn('Card', '1000');
      typeIn('Card', '');
      fireEvent.click(saveBtn());
      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toContain('No card/UPI takings entered'),
      );
      expect(mutateAsync).not.toHaveBeenCalled();
    });
  });

  describe('field errors', () => {
    const invalid = (label: RegExp | string) =>
      screen.getByLabelText(label).getAttribute('aria-invalid');

    it('highlights a negative aggregate Card and UPI', () => {
      withClient(<HandoverPanel />);
      typeIn('Card', '-5');
      typeIn('UPI', '-1');
      expect(invalid('Card')).toBe('true');
      expect(invalid('UPI')).toBe('true');
      expect(statusOf(/Card \/ UPI/)).toBe('error');
    });

    it('highlights the negative terminal field and nothing else', () => {
      assignment.data = makeAssignment({
        stationHasConfiguredTerminals: true,
        dispenserUnits: [
          du('1', NOZZLE, {
            terminals: [
              { terminalId: 'term-1', label: 'POS 1' },
              { terminalId: 'term-2', label: 'POS 2' },
            ],
          }),
        ],
      });
      withClient(<HandoverPanel />);
      fireEvent.click(stepHeader(/Card \/ UPI/));
      fireEvent.change(screen.getByRole('spinbutton', { name: 'UPI · POS 2' }), {
        target: { value: '-3' },
      });
      expect(
        screen.getByRole('spinbutton', { name: 'UPI · POS 2' }).getAttribute('aria-invalid'),
      ).toBe('true');
      expect(
        screen.getByRole('spinbutton', { name: 'UPI · POS 1' }).getAttribute('aria-invalid'),
      ).toBeNull();
      expect(
        screen.getByRole('spinbutton', { name: 'Card · POS 2' }).getAttribute('aria-invalid'),
      ).toBeNull();
    });

    it('highlights a cleared closing reading and a negative cash drop', () => {
      withClient(<HandoverPanel />);
      typeIn(/N-1 · Petrol/, '');
      typeIn(/^Cash drops/, '-1');
      expect(invalid(/N-1 · Petrol/)).toBe('true');
      expect(invalid(/^Cash drops/)).toBe('true');
    });
  });

  describe('accessibility', () => {
    it('names each terminal field with its terminal', () => {
      assignment.data = makeAssignment({
        stationHasConfiguredTerminals: true,
        dispenserUnits: [
          du('1', NOZZLE, {
            terminals: [
              { terminalId: 'term-1', label: 'POS 1' },
              { terminalId: 'term-2', label: 'POS 2' },
            ],
          }),
        ],
      });
      withClient(<HandoverPanel />);
      fireEvent.click(stepHeader(/Card \/ UPI/));
      for (const label of ['POS 1', 'POS 2']) {
        expect(screen.getByRole('spinbutton', { name: `Card · ${label}` })).toBeDefined();
        expect(screen.getByRole('spinbutton', { name: `UPI · ${label}` })).toBeDefined();
        expect(
          screen.getByRole('textbox', { name: `Batch ref (optional) · ${label}` }),
        ).toBeDefined();
      }
    });

    it('links each step header to its body and labels the section by its title', () => {
      withClient(<HandoverPanel />);
      const header = stepHeader(/Cash handed over/);
      const panel = document.getElementById(header.getAttribute('aria-controls')!);
      expect(panel).not.toBeNull();
      expect(panel!.hasAttribute('hidden')).toBe(true);
      fireEvent.click(header);
      expect(panel!.hasAttribute('hidden')).toBe(false);
      expect(screen.getByRole('region', { name: /Cash handed over/ })).toBeDefined();
    });
  });

  describe('credit slips', () => {
    it('shows the litres with their unit', () => {
      assignment.data = makeAssignment({
        dispenserUnits: [
          du('1', NOZZLE, {
            creditSales: [
              {
                id: 'c1',
                customerId: 'cu1',
                customerName: 'KTC',
                productId: 'prod-1',
                productName: 'Petrol',
                quantity: 20,
                amount: 2000,
                notes: null,
              },
            ],
          }),
        ],
      });
      withClient(<HandoverPanel />);
      expect(screen.getByText(/20 L Petrol/)).toBeDefined();
    });
  });

  describe('several DUs with merchandise', () => {
    // Merchandise cash is per attendant, and the server attributes it to every
    // Handover (#419). The preview mirrors that, so each Drawer's expected cash
    // and the strip are the same figures the save will record.
    it('keeps each Drawer and the strip consistent', () => {
      assignment.data = makeAssignment({
        dispenserUnits: [du('1', NOZZLE), du('2', NOZZLE_2)],
      });
      products.data = [
        { id: 'oil', name: 'Engine oil', productType: 'LUBE', sellingPrice: 400, isActive: true },
      ];
      merchHandovers.data = [
        { attendantId: 'att-1', items: [{ productId: 'oil', quantity: 2 }], nonCashAmount: 0 },
      ];
      withClient(<HandoverPanel />);
      const expectedCash = screen.getAllByText(/Expected cash:/).map((n) => n.textContent);
      expect(expectedCash).toHaveLength(2);
      for (const text of expectedCash) expect(text).toContain('cash sales ₹800.00');

      const strip = within(screen.getByRole('group', { name: 'Handover summary' }));
      const cell = (label: string) => strip.getByText(label).nextElementSibling!.textContent;
      // Σ of the two Drawers' expected totals, so the variance below adds up.
      expect(cell('Expected')).toBe('₹1,600.00');
      typeIn(/DU 1 · Cash \(₹\)/, '800');
      typeIn(/DU 2 · Cash \(₹\)/, '800');
      expect(cell('Variance')).toBe('Balanced');
    });
  });
});

// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vite-plus/test';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders, muteExpectedConsoleErrors } from '../../test/renderWithProviders.js';
import { handoverResultFor } from '../../test/handoverResult.js';

/**
 * The attendant handover is the point where metered fuel is reconciled against
 * what the attendant physically hands over. A wrong figure here is a cash
 * discrepancy blamed on a person, so these cover the arithmetic the operator
 * reads and the exact payload that would be sent — including the shapes that
 * differ from the mobile handover and would be easy to "tidy" into a break.
 */
const mutateAsync = vi.fn();
const recordCollection = vi.fn();
const voidCreditSale = vi.fn();
const voidOmcCardSale = vi.fn();

vi.mock('../../services/cloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CloudTransactionService: class {
    recordCollection = (...a: unknown[]) => recordCollection(...a);
    voidCreditSale = (...a: unknown[]) => voidCreditSale(...a);
    voidOmcCardSale = (...a: unknown[]) => voidOmcCardSale(...a);
  },
}));

vi.mock('../../query/handoverMutation.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRecordHandoverMutation: () => ({ mutateAsync, isPending: false }),
  loadHandoverRequestIdentity: () => null,
  saveHandoverRequestIdentity: vi.fn(),
}));

/** A query that has loaded `data`, as the Data Section reads it. */
const loaded = (data: unknown[]) => ({
  data,
  isPending: false,
  isError: false,
  fetchStatus: 'idle' as const,
  refetch: vi.fn(),
});

/** A query that failed, as the Data Section reads it. */
const failed = () => ({
  data: undefined,
  isPending: false,
  isError: true,
  fetchStatus: 'idle' as const,
  error: new Error('down'),
  refetch: vi.fn(),
});

type FakeQuery = ReturnType<typeof loaded> | ReturnType<typeof failed>;
const queries: { customers: () => FakeQuery; productSales: () => FakeQuery } = {
  customers: () => loaded([]),
  productSales: () => loaded([]),
};

vi.mock('../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAllVehicles: () => loaded([]),
  useCustomers: () => queries.customers(),
  useMerchandiseHandovers: () => queries.productSales(),
  useMerchandiseSales: () => loaded([]),
}));

// The Edit link opens the Handover Product Sale drawer; its own form is pinned
// in its own tests, so here it only reports that it opened, for whom.
vi.mock('./HandoverProductSaleDrawer.js', () => ({
  HandoverProductSaleDrawer: (p: { isOpen: boolean; employeeId: string | null }) =>
    p.isOpen ? <div role="dialog" aria-label={`Product sale for ${p.employeeId}`} /> : null,
}));

const { HandoverDrawer } = await import('./HandoverDrawer.js');

// `nozzleReadings` keys are validated as UUIDs, so fixtures must be real ones.
const NOZZLE_A = '11111111-1111-4111-8111-111111111111';
const NOZZLE_B = '22222222-2222-4222-8222-222222222222';
const NOZZLE_C = '33333333-3333-4333-8333-333333333333';

const nozzle = (id: string, over: Record<string, unknown> = {}) => ({
  nozzleId: id,
  nozzleName: `N-${id.slice(0, 4)}`,
  productId: 'prod-petrol',
  productName: 'Petrol',
  productCode: 'MS',
  unit: 'L',
  unitPrice: 100,
  openingReading: 1000,
  ...over,
});

const baseProps = (over: Record<string, unknown> = {}): any =>
  ({
    isOpen: true,
    onClose: vi.fn(),
    shiftId: 'shift-1',
    stationId: 'station-1',
    userId: 'user-1',
    userName: 'Ravi',
    duId: 'du-1',
    duCode: 'DU-1',
    nozzles: [nozzle(NOZZLE_A)],
    terminals: [],
    stationHasConfiguredTerminals: false,
    customers: [],
    creditSales: [],
    omcSales: [],
    merchandiseCash: 0,
    merchandiseNonCash: 0,
    existingHandover: null,
    onSaveSuccess: vi.fn(),
    ...over,
  }) as any;

const input = (name: string) => document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
const setReading = (nozzleId: string, value: string) =>
  fireEvent.change(input(`nozzleReadings.${nozzleId}`), { target: { value } });
const setField = (name: string, value: string) =>
  fireEvent.change(input(name), { target: { value } });

/** A reconciliation line's figure, by its label. */
const rowValue = (label: string) => {
  const dt = [...document.querySelectorAll('dt')].find((d) => d.textContent?.startsWith(label));
  return dt?.nextElementSibling?.textContent ?? '';
};
/** The drawer's variance chip (footer): its figure and its state. */
const variance = () => screen.getByTestId('handover-variance');
const saveButton = () =>
  screen.getByRole('button', { name: /Save handover & readings/ }) as HTMLButtonElement;

describe('HandoverDrawer', () => {
  let restoreConsole: () => void;
  beforeEach(() => {
    // A faithful echo: the drawer reseeds its form from result.nozzleReadings
    // after a save, so a partial stub throws and the operator sees an error
    // banner while a payload-only assertion still passes.
    mutateAsync
      .mockReset()
      .mockImplementation(({ payload }: { payload: never }) =>
        Promise.resolve(handoverResultFor(payload)),
      );
    recordCollection.mockReset();
    voidCreditSale.mockReset().mockResolvedValue({});
    voidOmcCardSale.mockReset().mockResolvedValue({});
    queries.customers = () => loaded([]);
    queries.productSales = () => loaded([]);
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

  it('renders nothing while closed', () => {
    renderWithProviders(<HandoverDrawer {...baseProps({ isOpen: false })} />);
    expect(screen.queryByText(/Handover ·/)).toBeNull();
  });

  it('identifies the attendant and their dispenser unit', () => {
    renderWithProviders(<HandoverDrawer {...baseProps()} />);
    expect(screen.getByText('Handover · DU-1 · Ravi')).toBeDefined();
    expect(screen.getByText('Pending · attendant handover')).toBeDefined();
  });

  it('lists nozzles in natural order whatever order they arrive in', () => {
    // #218: the shift-status query has no deterministic order, so the drawer
    // used to re-shuffle on each open — and N10 sorted between N1 and N2.
    renderWithProviders(
      <HandoverDrawer
        {...baseProps({
          nozzles: [
            nozzle(NOZZLE_B, { nozzleName: 'N10' }),
            nozzle(NOZZLE_C, { nozzleName: 'N2' }),
            nozzle(NOZZLE_A, { nozzleName: 'N1' }),
          ],
        })}
      />,
    );

    const rendered = [...document.querySelectorAll('input[name^="nozzleReadings."]')].map(
      (el) => (el as HTMLInputElement).name.split('.')[1],
    );
    expect(rendered).toEqual([NOZZLE_A, NOZZLE_C, NOZZLE_B]);
  });

  describe('expected sales from meter readings', () => {
    it('values the metered volume at the pump price', () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '1050'); // 50 L × ₹100
      expect(rowValue('Fuel sales')).toBe('₹5,000.00');
    });

    it('rounds fractional-paise expected sales to two decimals', () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '2020.78132');

      expect(rowValue('Fuel sales')).toBe('₹1,02,078.13');
    });

    it('deducts calibration testing volume from the expected sales', () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '1050');
      setField(`nozzleTesting.${NOZZLE_A}`, '5'); // 5 L returned to tank
      // 50 L sold − 5 L tested = 45 L × ₹100 = ₹4,500
      expect(rowValue('Fuel sales')).toContain('4,500');
    });

    it('sums across every nozzle on the unit', () => {
      renderWithProviders(
        <HandoverDrawer {...baseProps({ nozzles: [nozzle(NOZZLE_A), nozzle(NOZZLE_B)] })} />,
      );
      setReading(NOZZLE_A, '1050');
      setReading(NOZZLE_B, '1020');
      expect(rowValue('Fuel sales')).toContain('7,000');
    });

    it('folds product sales paid in cash into what the attendant owes', () => {
      renderWithProviders(<HandoverDrawer {...baseProps({ merchandiseCash: 500 })} />);
      setReading(NOZZLE_A, '1050');
      expect(rowValue('Product sales (cash)')).toBe('+₹500.00');
      expect(rowValue('Cash sales')).toBe('₹5,500.00');
    });

    it('says which Drawer counts the product cash when it is another DU (#419)', () => {
      renderWithProviders(
        <HandoverDrawer
          {...baseProps({
            merchandiseCash: 0,
            merchandiseNonCash: 900,
            productCashCountedIn: 'DU-1',
          })}
        />,
      );
      setReading(NOZZLE_A, '1050');
      expect(rowValue('Product sales')).toBe('counted in DU-1');
      expect(rowValue('Cash sales')).toBe('₹5,000.00');
      expect(screen.queryByText(/are not drawer cash/)).toBeNull();
      // Product sales are per attendant: this Drawer can still edit them.
      const edit = screen.getByRole('button', { name: "Edit attendant's product sales" });
      fireEvent.click(edit);
      expect(screen.getByRole('dialog', { name: 'Product sale for user-1' })).toBeDefined();
    });

    it('leaves product sales taken on card out of the cash expectation', () => {
      // Non-cash product sales never reach the attendant's hands.
      renderWithProviders(<HandoverDrawer {...baseProps({ merchandiseNonCash: 900 })} />);
      setReading(NOZZLE_A, '1050');
      expect(rowValue('Product sales (cash)')).toBe('₹0.00');
      expect(rowValue('Cash sales')).toBe('₹5,000.00');
      expect(screen.getByText(/are not drawer cash/)).toBeDefined();
    });

    it('reads expected = float + fuel cash + product cash − drops (#534)', () => {
      renderWithProviders(
        <HandoverDrawer {...baseProps({ merchandiseCash: 500, openingFloat: 1000 })} />,
      );
      setReading(NOZZLE_A, '1050'); // ₹5,000 fuel
      setField('cardHandedOver', '1500');
      fireEvent.click(screen.getByRole('button', { name: /Add cash drop/ }));
      setField('cashDrops', '2000');
      setField('cashHandedOver', '3000');
      expect(rowValue('Card · UPI')).toBe('−₹1,500.00');
      expect(rowValue('Cash sales')).toBe('₹4,000.00');
      expect(rowValue('Opening float')).toBe('+₹1,000.00');
      expect(rowValue('Cash drops')).toBe('−₹2,000.00');
      expect(rowValue('Expected in drawer')).toBe('₹3,000.00');
      expect(rowValue('Declared cash')).toBe('₹3,000.00');
      expect(variance().textContent).toBe('Balanced');
    });
  });

  describe('declared deposit and variance', () => {
    it('balances when cash, card, UPI and credit meet the expected sales', () => {
      renderWithProviders(
        <HandoverDrawer
          {...baseProps({ creditSales: [{ id: 'c1', amount: 1000, customerName: 'Acme' }] })}
        />,
      );
      setReading(NOZZLE_A, '1050'); // expects ₹5,000
      setField('cashHandedOver', '2500');
      setField('cardHandedOver', '1000');
      setField('upiHandedOver', '500');
      // 2,500 + 1,000 + 500 + 1,000 credit = 5,000
      expect(rowValue('Credit · OMC card')).toBe('−₹1,000.00');
      expect(variance().textContent).toBe('Balanced');
      expect(variance().getAttribute('data-variance')).toBe('balanced');
    });

    it('reports a shortage when the attendant is under', () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '1050');
      setField('cashHandedOver', '4800');
      expect(variance().textContent).toBe('−₹200.00');
      expect(variance().getAttribute('data-variance')).toBe('short');
    });

    it('reports a surplus when the attendant is over', () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '1050');
      setField('cashHandedOver', '5200');
      expect(variance().textContent).toBe('+₹200.00');
      expect(variance().getAttribute('data-variance')).toBe('surplus');
    });

    it('treats sub-paise float dust as balanced rather than a shortage', () => {
      renderWithProviders(
        <HandoverDrawer {...baseProps({ nozzles: [nozzle(NOZZLE_A, { unitPrice: 94.37 })] })} />,
      );
      setReading(NOZZLE_A, '1033.7');
      const expected = rowValue('Fuel sales').replace(/[₹,]/g, '');
      setField('cashHandedOver', expected);
      expect(variance().textContent).toBe('Balanced');
    });
  });

  describe('submitted payload', () => {
    it('sends each nozzle reading with its testing volume, and completes the save', async () => {
      const onSaveSuccess = vi.fn();
      renderWithProviders(<HandoverDrawer {...baseProps({ onSaveSuccess })} />);
      setReading(NOZZLE_A, '1050');
      setField(`nozzleTesting.${NOZZLE_A}`, '5');
      setField('cashHandedOver', '4500');
      fireEvent.click(saveButton());

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      // Without this the payload could be right while the save visibly errors.
      await waitFor(() => expect(onSaveSuccess).toHaveBeenCalled());
      const { payload } = mutateAsync.mock.calls[0][0];
      expect(payload.nozzleReadings).toEqual([
        { nozzleId: NOZZLE_A, closingReading: 1050, testingVolume: 5 },
      ]);
      expect(payload.cashHandedOver).toBe(4500);
      expect(payload.shiftId).toBe('shift-1');
      expect(payload.duId).toBe('du-1');
      expect(payload.userId).toBe('user-1');
    });

    it('carries aggregate card and UPI when the station has no terminals configured', async () => {
      renderWithProviders(
        <HandoverDrawer {...baseProps({ stationHasConfiguredTerminals: false })} />,
      );
      setReading(NOZZLE_A, '1050');
      setField('cashHandedOver', '3000');
      setField('cardHandedOver', '1500');
      setField('upiHandedOver', '500');
      fireEvent.click(saveButton());

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      const { payload } = mutateAsync.mock.calls[0][0];
      expect(payload.cardHandedOver).toBe(1500);
      expect(payload.upiHandedOver).toBe(500);
    });

    it('omits the aggregate card and UPI fields entirely once terminals are configured', async () => {
      // Not zeroed — omitted. A station on terminals must not have aggregate
      // figures silently overwrite its per-terminal settlement.
      renderWithProviders(
        <HandoverDrawer {...baseProps({ stationHasConfiguredTerminals: true })} />,
      );
      setReading(NOZZLE_A, '1050');
      setField('cashHandedOver', '5000');
      fireEvent.click(saveButton());

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      const { payload } = mutateAsync.mock.calls[0][0];
      expect('cardHandedOver' in payload).toBe(false);
      expect('upiHandedOver' in payload).toBe(false);
    });

    it('sends no terminal entries when the unit has no terminal', async () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '1050');
      setField('cashHandedOver', '5000');
      fireEvent.click(saveButton());

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      expect(mutateAsync.mock.calls[0][0].payload.terminalEntries).toBeUndefined();
    });

    it('shows failed saves inline, not in a toast, while keeping the retry idempotent', async () => {
      mutateAsync.mockRejectedValue(new Error('Assigned user cannot record this handover'));
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '1050');
      setField('cashHandedOver', '5000');

      fireEvent.click(saveButton());

      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toContain(
          'Assigned user cannot record this handover',
        ),
      );
      expect(screen.queryByRole('status')).toBeNull();
      const firstKey = mutateAsync.mock.calls[0][0].idempotencyKey;
      fireEvent.click(saveButton());
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));

      expect(mutateAsync.mock.calls[1][0].idempotencyKey).toBe(firstKey);
    });
  });

  describe('reopening for an existing handover', () => {
    // Guards the prefill effect and its `prefilledRef` latch. Both are the
    // effects #63 will touch, and they are the reason a re-save cannot silently
    // zero a calibration volume or clobber credit chits already entered.
    const existing = { cashHandedOver: '4200', cardHandedOver: '800', upiHandedOver: '300' };

    it('prefills the previously saved amounts', async () => {
      renderWithProviders(<HandoverDrawer {...baseProps({ existingHandover: existing })} />);
      await waitFor(() => expect(input('cashHandedOver').value).toBe('4200'));
      expect(input('cardHandedOver').value).toBe('800');
      expect(input('upiHandedOver').value).toBe('300');
    });

    it('prefills the previously saved calibration volume rather than zeroing it', async () => {
      renderWithProviders(
        <HandoverDrawer
          {...baseProps({
            existingHandover: existing,
            nozzles: [nozzle(NOZZLE_A, { closingReading: 1080, testingVolume: 7 })],
          })}
        />,
      );
      await waitFor(() => expect(input(`nozzleReadings.${NOZZLE_A}`).value).toBe('1080'));
      expect(input(`nozzleTesting.${NOZZLE_A}`).value).toBe('7');
    });

    it('does not clobber what the operator has typed while the drawer stays open', async () => {
      // The latch exists because onCreditChanged triggers a parent refetch; a
      // re-run mid-entry would wipe the figures being counted.
      const { rerender } = renderWithProviders(
        <HandoverDrawer {...baseProps({ existingHandover: existing })} />,
      );
      await waitFor(() => expect(input('cashHandedOver').value).toBe('4200'));
      setField('cashHandedOver', '4900');

      rerender(<HandoverDrawer {...baseProps({ existingHandover: { ...existing } })} />);
      expect(input('cashHandedOver').value).toBe('4900');
    });

    it('prefills again after the drawer is closed and reopened', async () => {
      const { rerender } = renderWithProviders(
        <HandoverDrawer {...baseProps({ existingHandover: existing })} />,
      );
      await waitFor(() => expect(input('cashHandedOver').value).toBe('4200'));
      setField('cashHandedOver', '4900');

      rerender(<HandoverDrawer {...baseProps({ isOpen: false, existingHandover: existing })} />);
      rerender(
        <HandoverDrawer
          {...baseProps({ existingHandover: { ...existing, cashHandedOver: '5100' } })}
        />,
      );
      await waitFor(() => expect(input('cashHandedOver').value).toBe('5100'));
    });

    it('shows the credit chits already recorded for this attendant', async () => {
      renderWithProviders(
        <HandoverDrawer
          {...baseProps({
            creditSales: [
              { id: 'c1', amount: 1200, customerName: 'Acme Transport' },
              { id: 'c2', amount: 800, customerName: 'Beta Logistics' },
            ],
          })}
        />,
      );
      await waitFor(() => expect(screen.getAllByText(/Acme Transport/).length).toBeGreaterThan(0));
      setReading(NOZZLE_A, '1050');
      // 2,000 of credit comes off the cash the 5,000 of fuel should leave.
      expect(rowValue('Credit · OMC card')).toBe('−₹2,000.00');
      expect(rowValue('Cash sales')).toBe('₹3,000.00');
    });
  });

  describe('recording a customer sale', () => {
    // #219: the button's busy state belongs to the write, not to the parent's
    // cache refresh. Tying it to the refresh left the spinner running for
    // seconds after the sale was already recorded.
    const openOmcRow = async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add customer sale/ }));
      fireEvent.click(await screen.findByText('OMC card → CMS'));
      fireEvent.change(input('ccAmount'), { target: { value: '500' } });
    };
    const addButton = () =>
      screen.getByRole('button', {
        name: /Add (?:OMC card|credit) sale/,
      }) as HTMLButtonElement;

    it('returns the button to idle without waiting for the parent refresh', async () => {
      recordCollection.mockResolvedValue({ id: 'collection-1' });
      let releaseRefresh!: () => void;
      const refreshed = new Promise<void>((resolve) => {
        releaseRefresh = resolve;
      });
      const onCreditChanged = vi.fn(() => refreshed);

      renderWithProviders(<HandoverDrawer {...baseProps({ onCreditChanged })} />);
      await openOmcRow();
      fireEvent.click(addButton());

      // The recorded line lands and the row is idle again while the parent's
      // refresh is still in flight.
      await waitFor(() =>
        expect(screen.getAllByText(/OMC card \(no customer\)/).length).toBeGreaterThan(0),
      );
      expect(addButton().getAttribute('aria-busy')).toBeNull();
      expect(onCreditChanged).toHaveBeenCalledTimes(1);
      releaseRefresh();
      await refreshed;
    });

    it('keeps the button actionable and reports the error when the write fails', async () => {
      recordCollection.mockRejectedValue(new Error('Collection rejected'));
      const onCreditChanged = vi.fn();

      renderWithProviders(<HandoverDrawer {...baseProps({ onCreditChanged })} />);
      await openOmcRow();
      fireEvent.click(addButton());

      await waitFor(() =>
        expect(screen.getAllByText(/Collection rejected/).length).toBeGreaterThan(0),
      );
      expect(addButton().disabled).toBe(false);
      expect(onCreditChanged).not.toHaveBeenCalled();
    });
  });

  describe('submit guards', () => {
    it('refuses a closing reading below the opening reading', async () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '900'); // opening is 1000
      await waitFor(() => expect(saveButton().disabled).toBe(true));
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('re-enables the save once the reading is corrected', async () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '900');
      await waitFor(() => expect(saveButton().disabled).toBe(true));
      setReading(NOZZLE_A, '1050');
      await waitFor(() => expect(saveButton().disabled).toBe(false));
    });
  });

  // #304/#324: most handovers have no drop, so the field hides behind "+ Add cash drop".
  describe('cash drops row', () => {
    const addButton = () => screen.queryByRole('button', { name: /Add cash drop/ });
    const removeButton = () => screen.getByRole('button', { name: 'Remove cash drop' });

    it('hides the drops field on a new handover until "Add cash drop" is clicked', () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      expect(input('cashDrops')).toBeNull();
      fireEvent.click(addButton()!);
      expect(input('cashDrops')).not.toBeNull();
      expect(addButton()).toBeNull();
    });

    it('starts open showing the drops of an edited handover that had them', async () => {
      renderWithProviders(
        <HandoverDrawer
          {...baseProps({ existingHandover: { cashHandedOver: '4000', cashDrops: '1000' } })}
        />,
      );
      expect(addButton()).toBeNull();
      await waitFor(() => expect(input('cashDrops').value).toBe('1000'));
    });

    it('zeroes the drops when removed, and the variance follows', async () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '1050'); // expects ₹5,000
      setField('cashHandedOver', '4000');
      fireEvent.click(addButton()!);
      setField('cashDrops', '1000'); // 4,000 + 1,000 dropped = balanced
      await waitFor(() => expect(variance().textContent).toBe('Balanced'));
      fireEvent.click(removeButton());
      expect(input('cashDrops')).toBeNull();
      await waitFor(() => expect(variance().textContent).toBe('−₹1,000.00'));
      fireEvent.click(addButton()!);
      expect(input('cashDrops').value).toBe('');
    });
  });

  describe('one Idempotency-Key per drawer open (#534)', () => {
    it('reuses the key for an edited retry after a lost answer, so the server refuses it', async () => {
      mutateAsync.mockRejectedValueOnce(
        Object.assign(new Error('Network down'), { status: undefined }),
      );
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '1050');
      setField('cashHandedOver', '5000');
      fireEvent.click(saveButton());
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));

      setField('cashHandedOver', '4900');
      fireEvent.click(saveButton());
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
      const [first, second] = mutateAsync.mock.calls.map((c) => c[0]);
      expect(second.payload.cashHandedOver).toBe(4900);
      expect(second.idempotencyKey).toBe(first.idempotencyKey);
    });

    it('takes a fresh key once a save is answered', async () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '1050');
      setField('cashHandedOver', '5000');
      fireEvent.click(saveButton());
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      const saveChanges = () => screen.getByRole('button', { name: /Save changes/ });
      await waitFor(() => expect(saveChanges()).toBeDefined());
      setField('cashHandedOver', '4900');
      fireEvent.click(
        screen.getByRole('button', { name: /Save changes|Save handover/ }) as HTMLButtonElement,
      );
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
      const [first, second] = mutateAsync.mock.calls.map((c) => c[0]);
      expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    });
  });

  describe('failed reads show an error with Retry, never an empty list (#534 review)', () => {
    it('says the customers could not load when adding a customer sale', () => {
      queries.customers = failed;
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /Add customer sale/ }));
      expect(screen.getByText(/Couldn.t load customers and vehicles/)).toBeDefined();
      expect(screen.getByRole('button', { name: /Retry/ })).toBeDefined();
      expect(screen.queryByText('Payment channel')).toBeNull();
    });

    it('says the product sales could not load instead of offering Edit', () => {
      queries.productSales = failed;
      renderWithProviders(<HandoverDrawer {...baseProps({ merchandiseCash: 450 })} />);
      expect(screen.queryByRole('button', { name: /Edit Ravi's product sales/ })).toBeNull();
      expect(screen.getByText(/Couldn.t load product sales/)).toBeDefined();
    });
  });

  describe('voiding a customer sale is keyed (#534 review)', () => {
    it('sends an Idempotency-Key, reused when the same void is retried after a lost answer', async () => {
      voidCreditSale
        .mockReset()
        .mockRejectedValueOnce(Object.assign(new Error('Network down'), { status: undefined }))
        .mockResolvedValueOnce({});
      renderWithProviders(
        <HandoverDrawer
          {...baseProps({ creditSales: [{ id: 'c1', amount: 1000, customerName: 'Acme' }] })}
        />,
      );
      const voidButton = () => screen.getByRole('button', { name: 'Void this credit sale' });
      fireEvent.click(voidButton());
      await waitFor(() => expect(voidCreditSale).toHaveBeenCalledTimes(1));
      await waitFor(() => expect((voidButton() as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(voidButton());
      await waitFor(() => expect(voidCreditSale).toHaveBeenCalledTimes(2));
      const [first, second] = voidCreditSale.mock.calls;
      expect(first[0]).toBe('c1');
      expect(first[1].idempotencyKey).toEqual(expect.any(String));
      expect(second[1].idempotencyKey).toBe(first[1].idempotencyKey);
    });

    it('keys an OMC card void too', async () => {
      renderWithProviders(
        <HandoverDrawer {...baseProps({ omcSales: [{ id: 'o1', amount: 500 }] })} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Void this OMC card sale' }));
      await waitFor(() => expect(voidOmcCardSale).toHaveBeenCalledTimes(1));
      expect(voidOmcCardSale.mock.calls[0][1].idempotencyKey).toEqual(expect.any(String));
    });
  });

  it('restores the declared total as one line (#534 review)', () => {
    renderWithProviders(
      <HandoverDrawer
        {...baseProps({
          creditSales: [{ id: 'c1', amount: 1000, customerName: 'Acme' }],
          omcSales: [{ id: 'o1', amount: 250 }],
        })}
      />,
    );
    setField('cashHandedOver', '2500');
    setField('cardHandedOver', '1000');
    setField('upiHandedOver', '500');
    expect(rowValue('Declared total (cash + card + UPI + credit + OMC)')).toBe('₹5,250.00');
  });

  describe('product sales in the reconciliation (#534)', () => {
    it('opens this attendant’s handover product sale from Edit', async () => {
      renderWithProviders(<HandoverDrawer {...baseProps({ merchandiseCash: 450 })} />);
      fireEvent.click(screen.getByRole('button', { name: /Edit Ravi's product sales/ }));
      expect(await screen.findByRole('dialog', { name: 'Product sale for user-1' })).toBeDefined();
    });

    it('never says merchandise on screen', () => {
      renderWithProviders(
        <HandoverDrawer {...baseProps({ merchandiseCash: 450, merchandiseNonCash: 100 })} />,
      );
      expect(document.body.textContent).not.toMatch(/merchandise/i);
    });
  });

  // #303: the long explainer sits behind an info icon.
  it('keeps the customer-sales explainer in an info tip that opens on focus and tap', () => {
    renderWithProviders(<HandoverDrawer {...baseProps()} />);
    expect(screen.queryByText(/settled to the CMS account/)).toBeNull();
    const tip = screen.getByRole('button', { name: 'About customer sales' });
    fireEvent.focus(tip);
    expect(screen.getByRole('tooltip').textContent).toMatch(/settled to the CMS account/);
    fireEvent.blur(tip);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(tip);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(tip, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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

vi.mock('../../services/cloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CloudTransactionService: class {
    recordCollection = (...a: unknown[]) => recordCollection(...a);
    voidCreditSale = vi.fn();
    voidOmcCardSale = vi.fn();
  },
}));

vi.mock('../../query/handoverMutation.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRecordHandoverMutation: () => ({ mutateAsync, isPending: false }),
  loadHandoverRequestIdentity: () => null,
  saveHandoverRequestIdentity: vi.fn(),
}));

vi.mock('../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAllVehicles: () => ({ data: [] }),
}));

const { HandoverDrawer } = await import('./HandoverDrawer.js');

// `nozzleReadings` keys are validated as UUIDs, so fixtures must be real ones.
const NOZZLE_A = '11111111-1111-4111-8111-111111111111';
const NOZZLE_B = '22222222-2222-4222-8222-222222222222';

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

/* eslint-disable @typescript-eslint/no-explicit-any */
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

const rowValue = (label: string) => {
  const span = screen.getByText(label);
  return span.parentElement?.querySelector('strong')?.textContent ?? '';
};
const saveButton = () =>
  screen.getByRole('button', { name: /Save Handover & Readings/ }) as HTMLButtonElement;

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
    expect(screen.queryByText(/Attendant Handover/)).toBeNull();
  });

  it('identifies the attendant and their dispenser unit', () => {
    renderWithProviders(<HandoverDrawer {...baseProps()} />);
    expect(screen.getByText('Attendant Handover: Ravi (DU-1)')).toBeDefined();
  });

  describe('expected sales from meter readings', () => {
    it('values the metered volume at the pump price', () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '1050'); // 50 L × ₹100
      expect(rowValue('Expected Fuel Sales Value:')).toBe('₹5,000.00');
    });

    it('rounds fractional-paise expected sales to two decimals', () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '2020.78132');

      expect(rowValue('Expected Fuel Sales Value:')).toBe('₹1,02,078.13');
    });

    it('deducts calibration testing volume from the expected sales', () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '1050');
      setField(`nozzleTesting.${NOZZLE_A}`, '5'); // 5 L returned to tank
      // 50 L sold − 5 L tested = 45 L × ₹100 = ₹4,500
      expect(rowValue('Expected Fuel Sales Value:')).toContain('4,500');
    });

    it('sums across every nozzle on the unit', () => {
      renderWithProviders(
        <HandoverDrawer {...baseProps({ nozzles: [nozzle(NOZZLE_A), nozzle(NOZZLE_B)] })} />,
      );
      setReading(NOZZLE_A, '1050');
      setReading(NOZZLE_B, '1020');
      expect(rowValue('Expected Fuel Sales Value:')).toContain('7,000');
    });

    it('folds walk-in merchandise cash into what the attendant owes', () => {
      renderWithProviders(<HandoverDrawer {...baseProps({ merchandiseCash: 500 })} />);
      setReading(NOZZLE_A, '1050');
      expect(rowValue('Total Expected:')).toContain('5,500');
    });

    it('leaves merchandise taken on card out of the cash expectation', () => {
      // Non-cash merchandise never reaches the attendant's hands.
      renderWithProviders(<HandoverDrawer {...baseProps({ merchandiseNonCash: 900 })} />);
      setReading(NOZZLE_A, '1050');
      expect(rowValue('Total Expected:')).toContain('5,000');
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
      expect(rowValue('Declared Deposit Sum:')).toContain('5,000');
      expect(screen.getByText(/Balanced/)).toBeDefined();
    });

    it('reports a shortage when the attendant is under', () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '1050');
      setField('cashHandedOver', '4800');
      expect(screen.getByText(/Shortage/)).toBeDefined();
    });

    it('reports a surplus when the attendant is over', () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '1050');
      setField('cashHandedOver', '5200');
      expect(screen.getByText(/Surplus/)).toBeDefined();
    });

    it('treats sub-paise float dust as balanced rather than a shortage', () => {
      renderWithProviders(
        <HandoverDrawer {...baseProps({ nozzles: [nozzle(NOZZLE_A, { unitPrice: 94.37 })] })} />,
      );
      setReading(NOZZLE_A, '1033.7');
      const expected = rowValue('Expected Fuel Sales Value:').replace(/[₹,]/g, '');
      setField('cashHandedOver', expected);
      expect(screen.getByText(/Balanced/)).toBeDefined();
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

    it('shows failed saves inline and in a toast while keeping the retry idempotent', async () => {
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
      expect(screen.getByRole('status').textContent).toBe(
        'Assigned user cannot record this handover',
      );
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
      // 2,000 of credit counts toward the 5,000 expected.
      expect(rowValue('Declared Deposit Sum:')).toContain('2,000');
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
});

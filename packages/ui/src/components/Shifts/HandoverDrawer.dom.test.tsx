// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';

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
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mutateAsync
      .mockReset()
      .mockResolvedValue({ expectedTotal: 0, declaredTotal: 0, varianceAmount: 0 });
    recordCollection.mockReset();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {}) as never;
  });
  afterEach(() => {
    cleanup();
    consoleError.mockRestore();
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
      expect(rowValue('Expected Fuel Sales Value:')).toContain('5,000');
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
    it('sends each nozzle reading with its testing volume', async () => {
      renderWithProviders(<HandoverDrawer {...baseProps()} />);
      setReading(NOZZLE_A, '1050');
      setField(`nozzleTesting.${NOZZLE_A}`, '5');
      setField('cashHandedOver', '4500');
      fireEvent.click(saveButton());

      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
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

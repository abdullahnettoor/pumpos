// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';

const idle = { data: undefined, isLoading: false, isError: false, isSuccess: true, error: null };
const money = vi.fn((_params: { stationId?: string; from?: string; to?: string }) => ({
  ...idle,
  data: {
    openings: [{ account: 'Cash', opening: 1000 }],
    movements: [
      {
        id: 'm1',
        account: 'Cash',
        businessDate: '2026-10-03',
        direction: 'in',
        amount: 500,
        description: 'Collection',
      },
    ],
  },
}));

const supplierRows = vi.hoisted(() => ({ rows: [] as unknown[] }));
const stationSuppliers = vi.fn((_stationId?: string | null) => ({
  ...idle,
  data: [{ id: 's1', name: 'IOCL Depot' }],
}));
const supplierLedger = vi.fn((_stationId?: string | null, id?: string) =>
  id ? { ...idle, data: supplierRows.rows } : idle,
);
vi.mock('../../query/hooks.js', () => ({
  useCustomers: () => ({ ...idle, data: [] }),
  useStationSuppliers: (stationId?: string | null) => stationSuppliers(stationId),
  useCustomerLedger: () => idle,
  useSupplierLedger: (stationId?: string | null, id?: string) => supplierLedger(stationId, id),
  useMoneyMovements: (p: { stationId?: string; from?: string; to?: string }) => money(p),
}));

const { UnifiedLedger } = await import('./UnifiedLedger.js');

const STATION = {
  id: 'st-1',
  name: 'Test Station',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '00:00' },
};

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  money.mockClear();
  stationSuppliers.mockClear();
  supplierLedger.mockClear();
});

describe('UnifiedLedger', () => {
  it('loads a ledger as soon as it is chosen, with no View Ledger step', () => {
    renderWithProviders(<UnifiedLedger selectedStation={STATION} />);
    expect(screen.queryByRole('button', { name: /view ledger/i })).toBeNull();
    // The range is a DateRangeMenu, not the old From/To field pair.
    const range = screen.getByRole('button', { name: /^Report period/ });
    expect(range.getAttribute('aria-haspopup')).toBe('menu');

    // Customer needs a customer picked first: nothing loads yet.
    expect(screen.getByText('Select a ledger')).toBeTruthy();
    expect(money.mock.calls.every(([p]) => p.stationId == null)).toBe(true);

    // Owner needs no entity: choosing it loads the statement at once.
    fireEvent.click(screen.getByRole('button', { name: /Customer/ }));
    fireEvent.mouseDown(screen.getByRole('option', { name: /^Owner/ }));
    expect(money).toHaveBeenLastCalledWith(expect.objectContaining({ stationId: 'st-1' }));
    expect(screen.queryByText('Select a ledger')).toBeNull();
    expect(screen.getByText('Owner ledger')).toBeTruthy();
  });

  it('offers no merged Cash or Bank statement, and points to Cash & bank (#531)', () => {
    const onOpenCashBank = vi.fn();
    renderWithProviders(
      <UnifiedLedger selectedStation={STATION} onOpenCashBank={onOpenCashBank} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Customer/ }));
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Customer', 'Supplier', 'Owner']);
    fireEvent.mouseDown(screen.getByRole('option', { name: /^Customer/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Cash & bank' }));
    expect(onOpenCashBank).toHaveBeenCalled();
  });

  it('dates a party row by the station clock, never the UTC slice of its timestamp (#568)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T06:00:00Z'));
    try {
      supplierRows.rows = [
        // 30 Sep 15:30 IST: before October, so it is the opening.
        {
          id: 'p1',
          transactionType: 'Purchase',
          amount: 1000,
          businessDate: '2026-09-30T10:00:00.000Z',
        },
        // 1 Oct 01:30 IST, though its UTC date is still 30 Sep: inside October.
        {
          id: 'p2',
          transactionType: 'Payment',
          amount: 400,
          businessDate: '2026-09-30T20:00:00.000Z',
        },
      ];
      renderWithProviders(<UnifiedLedger selectedStation={STATION} />);
      fireEvent.click(screen.getByRole('button', { name: /Customer/ }));
      fireEvent.mouseDown(screen.getByRole('option', { name: /^Supplier/ }));
      fireEvent.click(screen.getByRole('button', { name: /Select supplier/ }));
      fireEvent.mouseDown(screen.getByRole('option', { name: /IOCL Depot/ }));
      const statement = screen.getByRole('table', { name: 'IOCL Depot statement' });
      // The picker and the ledger are this Station's (#575).
      expect(stationSuppliers).toHaveBeenCalledWith('st-1');
      expect(supplierLedger).toHaveBeenLastCalledWith('st-1', 's1');
      expect(statement.textContent).toContain('1 Oct');
      expect(statement.textContent).not.toContain('30 Sep');
      // The payment is in the range; the opening carries only the 30 Sep purchase.
      expect(statement.textContent).toMatch(/Payment/);
      expect(statement.textContent).not.toMatch(/Purchase/);
      expect(statement.textContent).toContain('1,000.00');
    } finally {
      vi.useRealTimers();
      supplierRows.rows = [];
    }
  });
});

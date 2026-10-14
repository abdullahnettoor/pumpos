// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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

vi.mock('../../query/hooks.js', () => ({
  useCustomers: () => ({ ...idle, data: [] }),
  useSuppliers: () => ({ ...idle, data: [] }),
  useCustomerLedger: () => idle,
  useSupplierLedger: () => idle,
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
});

describe('UnifiedLedger', () => {
  it('loads a ledger as soon as it is chosen, with no View Ledger step', () => {
    render(<UnifiedLedger selectedStation={STATION} />);
    expect(screen.queryByRole('button', { name: /view ledger/i })).toBeNull();
    // The range is a DateRangeMenu, not the old From/To field pair.
    const range = screen.getByRole('button', { name: /^Date range/ });
    expect(range.getAttribute('aria-haspopup')).toBe('menu');

    // Customer needs a customer picked first: nothing loads yet.
    expect(screen.getByText('Select a ledger')).toBeTruthy();
    expect(money.mock.calls.every(([p]) => p.stationId == null)).toBe(true);

    // Cash needs no entity: choosing it loads the statement at once.
    fireEvent.click(screen.getByRole('button', { name: /Customer/ }));
    fireEvent.mouseDown(screen.getByRole('option', { name: /^Cash/ }));
    expect(money).toHaveBeenLastCalledWith(expect.objectContaining({ stationId: 'st-1' }));
    expect(screen.queryByText('Select a ledger')).toBeNull();
    expect(screen.getByText('Cash Ledger')).toBeTruthy();
  });
});

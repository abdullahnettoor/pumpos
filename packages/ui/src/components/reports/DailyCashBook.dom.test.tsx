// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders, createTestQueryClient } from '../../test/renderWithProviders.js';

vi.mock('@pump/shared', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveEntryDate: () => '2026-03-01',
}));

const { DailyCashBook } = await import('./DailyCashBook.js');
const { queryKeys } = await import('../../query/hooks.js');

const STATION = { id: 'st-1', name: 'Test RO', settings: { timezone: 'Asia/Kolkata' } };

const account = (over: Record<string, unknown>) => ({
  opening: 0,
  moneyIn: 0,
  moneyOut: 0,
  closing: 0,
  entries: [],
  ...over,
});

const seed = (date: string, accounts: unknown[]) => {
  const qc = createTestQueryClient();
  qc.setQueryData(queryKeys.dailyCashBook('st-1', date), { date, accounts });
  return qc;
};

afterEach(cleanup);

describe('DailyCashBook', () => {
  it('lists accounts in type order with a cash total of Cash in Hand + Petty Cash', () => {
    const qc = seed('2026-03-01', [
      account({ id: 'b', name: 'HDFC', accountType: 'BANK', opening: 5000, closing: 5000 }),
      account({
        id: 'c',
        name: 'Cash in Hand',
        accountType: 'CASH_IN_HAND',
        opening: 1000,
        moneyIn: 500,
        moneyOut: 200,
        closing: 1300,
      }),
      account({ id: 'p', name: 'Petty', accountType: 'PETTY_CASH', opening: 100, closing: 100 }),
    ]);
    renderWithProviders(<DailyCashBook selectedStation={STATION} />, { queryClient: qc });

    const rows = screen.getAllByRole('row');
    // header, 3 accounts, cash total
    expect(rows).toHaveLength(5);
    expect(rows[1].textContent).toContain('Cash in Hand');
    expect(rows[2].textContent).toContain('Petty');
    expect(rows[3].textContent).toContain('HDFC');
    expect(rows[4].textContent).toContain('Cash total');
    expect(rows[4].textContent).toContain('1,400');
    expect((screen.getByRole('button', { name: 'Next day' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('opens an account drawer listing the day entries with source labels', () => {
    const qc = seed('2026-03-01', [
      account({
        id: 'c',
        name: 'Cash in Hand',
        accountType: 'CASH_IN_HAND',
        moneyIn: 700,
        moneyOut: 50,
        closing: 650,
        entries: [
          {
            id: 'e1',
            direction: 'in',
            amount: 700,
            sourceType: 'SALE_CASH',
            sourceId: 's1',
            notes: 'Shift A',
            createdAt: '2026-03-01T10:00:00.000Z',
          },
          {
            id: 'e2',
            direction: 'out',
            amount: 50,
            sourceType: 'EXPENSE',
            sourceId: 'x1',
            notes: null,
            createdAt: '2026-03-01T11:00:00.000Z',
          },
        ],
      }),
    ]);
    renderWithProviders(<DailyCashBook selectedStation={STATION} />, { queryClient: qc });

    fireEvent.click(screen.getByRole('row', { name: 'Cash in Hand entries' }));
    const table = screen.getByRole('table', { name: 'Cash in Hand entries' });
    expect(within(table).getByText('Shift cash')).toBeTruthy();
    expect(within(table).getByText('Expense')).toBeTruthy();
  });

  it('steps back a day and shows the empty state when no accounts exist', () => {
    const qc = seed('2026-03-01', []);
    qc.setQueryData(queryKeys.dailyCashBook('st-1', '2026-02-28'), {
      date: '2026-02-28',
      accounts: [],
    });
    renderWithProviders(<DailyCashBook selectedStation={STATION} />, { queryClient: qc });

    expect(screen.getByText('No accounts yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect((screen.getByLabelText('Cash book date') as HTMLInputElement).value).toBe('2026-02-28');
  });
});

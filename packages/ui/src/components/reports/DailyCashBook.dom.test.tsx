// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders, createTestQueryClient } from '../../test/renderWithProviders.js';

// "Today" is 1 Mar 2026; a dated instant still resolves on the real station clock.
vi.mock('@pump/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pump/shared')>();
  return {
    ...actual,
    resolveEntryDate: (o: Parameters<typeof actual.resolveEntryDate>[0] = {}) =>
      o.now ? actual.resolveEntryDate(o) : '2026-03-01',
  };
});

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

  const cashEntries = [
    {
      id: 'e1',
      direction: 'in',
      amount: 700,
      sourceType: 'SALE_CASH',
      sourceId: 's1',
      createdAt: '2026-03-01T10:00:00.000Z',
    },
    {
      id: 'e2',
      direction: 'out',
      amount: 50,
      sourceType: 'EXPENSE',
      sourceId: 'x1',
      createdAt: '2026-03-01T11:00:00.000Z',
    },
  ];

  it('scrolls the drawer to the latest row and the closing line when it opens', () => {
    const scrolled: Element[] = [];
    const scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this);
    });
    Element.prototype.scrollIntoView = scrollIntoView;
    const qc = seed('2026-03-01', [
      account({
        id: 'c',
        name: 'Cash in Hand',
        accountType: 'CASH_IN_HAND',
        opening: 100,
        moneyIn: 700,
        moneyOut: 50,
        closing: 750,
        entries: cashEntries,
      }),
    ]);
    renderWithProviders(<DailyCashBook selectedStation={STATION} />, { queryClient: qc });
    expect(scrollIntoView).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('row', { name: 'Cash in Hand entries' }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'end' });
    // What it scrolls to sits after the table, below the closing line.
    const target = scrolled[0];
    const table = screen.getByRole('table', { name: 'Cash in Hand entries' });
    expect(table.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it("prints the server's opening and closing when they add up, and says so when they don't", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const qc = seed('2026-03-01', [
      account({
        id: 'c',
        name: 'Cash in Hand',
        accountType: 'CASH_IN_HAND',
        opening: 100,
        moneyIn: 700,
        moneyOut: 50,
        closing: 750,
        entries: cashEntries,
      }),
      account({
        id: 'b',
        name: 'HDFC',
        accountType: 'BANK',
        opening: 100,
        moneyIn: 700,
        moneyOut: 50,
        // Not opening + in − out: the entries are the truth the drawer shows.
        closing: 999,
        entries: cashEntries,
      }),
    ]);
    renderWithProviders(<DailyCashBook selectedStation={STATION} />, { queryClient: qc });

    fireEvent.click(screen.getByRole('row', { name: 'Cash in Hand entries' }));
    let table = screen.getByRole('table', { name: 'Cash in Hand entries' });
    expect(table.querySelector('tfoot')!.textContent).toContain('750.00');
    expect(screen.queryByRole('note')).toBeNull();
    cleanup();

    renderWithProviders(<DailyCashBook selectedStation={STATION} />, { queryClient: qc });
    fireEvent.click(screen.getByRole('row', { name: 'HDFC entries' }));
    table = screen.getByRole('table', { name: 'HDFC entries' });
    expect(table.querySelector('tfoot')!.textContent).toContain('750.00');
    expect(table.querySelector('tfoot')!.textContent).not.toContain('999');
    expect(screen.getByRole('note').textContent).toMatch(/don.t add up/);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("dates every row with the book's date; a back-dated record keeps its station-clock time", () => {
    const qc = seed('2026-03-01', [
      account({
        id: 'c',
        name: 'Cash in Hand',
        accountType: 'CASH_IN_HAND',
        moneyOut: 50,
        closing: -50,
        entries: [
          {
            id: 'e1',
            direction: 'out',
            amount: 50,
            sourceType: 'EXPENSE',
            sourceId: 'x1',
            // Recorded on 3 Mar, back-dated into the 1 Mar book.
            createdAt: '2026-03-03T10:00:00.000Z',
          },
        ],
      }),
    ]);
    renderWithProviders(<DailyCashBook selectedStation={STATION} />, { queryClient: qc });

    fireEvent.click(screen.getByRole('row', { name: 'Cash in Hand entries' }));
    const table = screen.getByRole('table', { name: 'Cash in Hand entries' });
    const row = within(table).getByText('Expense').closest('tr')!;
    expect(row.textContent).toContain('1 Mar 2026');
    expect(row.textContent).not.toContain('3 Mar');
    // 10:00 UTC on the station clock (Asia/Kolkata).
    expect(row.textContent).toMatch(/03:30\s*pm/i);
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
    expect(
      screen.getByRole('button', { name: /^Cash book date: / }).getAttribute('data-value'),
    ).toBe('2026-02-28');
  });
});

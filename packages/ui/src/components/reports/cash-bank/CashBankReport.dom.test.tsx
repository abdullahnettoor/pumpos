// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders.js';

const q = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
}));
vi.mock('../../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useFinanceMovements: () => q.state,
}));
// Radix's menu popup loops forever in jsdom: render the Export menu inline.
vi.mock('../../../pump-ds/menu/Menu.js', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    Menu: Pass,
    MenuTrigger: Pass,
    MenuContent: ({ children }: { children?: React.ReactNode }) => (
      <div role="menu">{children}</div>
    ),
    MenuItem: ({ children, onSelect }: { children?: React.ReactNode; onSelect?: () => void }) => (
      <div role="menuitem" tabIndex={-1} onClick={() => onSelect?.()}>
        {children}
      </div>
    ),
  };
});
const pdf = vi.hoisted(() => ({ fn: vi.fn(async () => {}) }));
vi.mock('./cashBankPdf.js', () => ({ generateCashBankPdf: pdf.fn }));

const { CashBankReport } = await import('./CashBankReport.js');

const STATION = {
  id: 'st-1',
  name: 'Test Station',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
};

const acc = (accountId: string, accountType: string, accountName: string, opening = 0) => ({
  accountId,
  accountType,
  accountName,
  shared: false,
  isActive: true,
  opening: String(opening),
});
const mv = (
  id: string,
  accountId: string,
  direction: 'in' | 'out',
  amount: number,
  t?: string,
) => ({
  id,
  entryDate: '2026-10-10',
  accountId,
  accountType: '',
  accountName: '',
  direction,
  amount: String(amount),
  sourceType: t ? 'TRANSFER' : 'OTHER',
  transferId: t ?? null,
  notes: null,
  createdAt: '2026-10-10T05:00:00.000Z',
});

const ready = (data: unknown) => ({
  data,
  isPending: false,
  isError: false,
  fetchStatus: 'idle',
  error: null,
  refetch: vi.fn(),
});

const DATA = {
  openings: [
    acc('cash', 'CASH_IN_HAND', 'Cash in Hand', 10_000),
    acc('petty', 'PETTY_CASH', 'Petty Cash', 500),
    acc('hdfc', 'BANK', 'HDFC ••4512', 50_000),
    acc('old', 'BANK', 'Old ICICI', 0),
    acc('cms', 'CMS', 'CMS wallet', 0),
    { ...acc('ho', 'BANK', 'Head office HDFC', 900), shared: true },
  ],
  movements: [
    mv('m1', 'cash', 'in', 8_000),
    mv('m2', 'cash', 'out', 1_000, 't1'),
    mv('m3', 'petty', 'in', 1_000, 't1'),
    mv('m4', 'cash', 'out', 5_000, 't2'),
    mv('m5', 'hdfc', 'in', 5_000, 't2'),
    mv('m6', 'cms', 'in', 700),
  ],
};

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  pdf.fn.mockClear();
});

const tableOf = (name: string) =>
  screen.getByTestId(`section-header-${name}`).parentElement!.querySelector('table')!;

describe('Reports › Cash & bank summary (#531)', () => {
  it('lists one row per account under Cash and Bank, with group totals that say what they leave out', () => {
    q.state = ready(DATA);
    renderWithProviders(<CashBankReport selectedStation={STATION} />);
    const cash = within(tableOf('cash'));
    expect(cash.getByText('Cash in Hand')).toBeTruthy();
    expect(cash.getByText('Petty Cash')).toBeTruthy();
    expect(cash.getByText('Cash total excl. transfers within cash')).toBeTruthy();
    const bank = within(tableOf('bank'));
    expect(bank.getByText('HDFC ••4512')).toBeTruthy();
    // A cash deposit moved money between the groups: Bank's total keeps it.
    expect(bank.getByText('Bank total')).toBeTruthy();
    // The shared head-office account and the idle bank stay out.
    expect(screen.queryByText('Head office HDFC')).toBeNull();
    expect(screen.queryByText('Old ICICI')).toBeNull();
  });

  it('shows Cash + Bank in four in-range tiles, net of transfers between its accounts', () => {
    q.state = ready(DATA);
    renderWithProviders(<CashBankReport selectedStation={STATION} />);
    const tiles = screen.getAllByText('In range');
    expect(tiles).toHaveLength(4);
    // The tile whose label reads `label` (the tables have an Opening column too).
    const tile = (label: string) =>
      screen
        .getAllByText(label)
        .map((el) => el.parentElement!.parentElement!)
        .find((t) => t.querySelector('.kpi-value'))!;
    expect(tile('Opening').textContent).toContain('₹60,500.00');
    // In: only the shift's ₹8,000; the petty transfer and the deposit stay out.
    expect(tile('Money in').textContent).toContain('₹8,000.00');
    expect(tile('Money out').textContent).toContain('₹0.00');
    expect(tile('Closing').textContent).toContain('₹68,500.00');
  });

  it('shows an idle account on "All accounts"', () => {
    q.state = ready(DATA);
    renderWithProviders(<CashBankReport selectedStation={STATION} />);
    fireEvent.click(screen.getByRole('radio', { name: /All accounts/ }));
    expect(within(tableOf('bank')).getByText('Old ICICI')).toBeTruthy();
  });

  it('keeps CMS, clearing and owner accounts collapsed apart from Cash + Bank', () => {
    q.state = ready(DATA);
    renderWithProviders(<CashBankReport selectedStation={STATION} />);
    expect(screen.queryByText('CMS wallet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show/ }));
    expect(within(tableOf('other-accounts')).getByText('CMS wallet')).toBeTruthy();
  });

  it("opens the account's statement on Accounts from a row", () => {
    q.state = ready(DATA);
    const onNavigate = vi.fn();
    renderWithProviders(<CashBankReport selectedStation={STATION} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('row', { name: 'HDFC ••4512 statement' }));
    expect(onNavigate).toHaveBeenCalledWith('/accounts', { openAccountId: 'hdfc' });
  });

  it('prints the summary through the PDF path', async () => {
    q.state = ready(DATA);
    renderWithProviders(<CashBankReport selectedStation={STATION} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Print' }));
    await vi.waitFor(() => expect(pdf.fn).toHaveBeenCalled());
    expect((pdf.fn.mock.calls[0] as unknown[])[3]).toBe('print');
  });

  it('a failed load shows Retry in each section, not an empty report', () => {
    q.state = {
      data: undefined,
      isPending: false,
      isError: true,
      fetchStatus: 'idle',
      error: new Error('boom'),
      refetch: vi.fn(),
    };
    renderWithProviders(<CashBankReport selectedStation={STATION} />);
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(/No cash or bank accounts/)).toBeNull();
  });
});

/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReceivablesSummary } from '@pump/shared';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { computeRange } from '../../pump-ds/index.js';
import { shortMonth } from '../../utils/format.js';
import { publishNavIntent, __resetNavIntentForTests } from '../../nav-intent/store.js';
import { CustomersList } from '../CustomersList.js';

/**
 * Customers on the shared modules (#527): Page Frame, layout B balance list
 * and ledgers, Data Sections per region, Table module, status vocabulary.
 */

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
} as any;

const today = computeRange('today', { timeZone: 'Asia/Kolkata' }).from;
const month = shortMonth(Number(today.slice(5, 7)));

const CUSTOMERS = [
  {
    id: 'rtc',
    name: 'RTC Depot',
    customerType: 'Fleet',
    creditLimit: 300000,
    currentBalance: 362000,
    isActive: true,
  },
  {
    id: 'sbt',
    name: 'Sri Balaji',
    customerType: 'Fleet',
    creditLimit: 200000,
    currentBalance: 30000,
    isActive: true,
  },
  {
    id: 'hp',
    name: 'Hotel Paramount',
    customerType: 'Credit',
    creditLimit: 25000,
    currentBalance: -2500,
    isActive: true,
  },
  {
    id: 'cc',
    name: 'Calicut Couriers',
    customerType: 'Credit',
    creditLimit: 0,
    currentBalance: 54100,
    isActive: false,
  },
];

const aging = { d0_7: 0, d8_30: 0, d30plus: 0 };
const RECEIVABLES: ReceivablesSummary = {
  total: 392000,
  customerCount: 2,
  aging: { d0_7: 30000, d8_30: 0, d30plus: 362000 },
  customers: [
    { customerId: 'rtc', balance: 362000, oldestUnpaidDate: null, oldestUnpaidDays: 47, aging },
    { customerId: 'sbt', balance: 30000, oldestUnpaidDate: null, oldestUnpaidDays: 5, aging },
  ],
};

const COLLECTIONS = [
  {
    id: 'k1',
    entryDate: today,
    customerId: 'sbt',
    customerName: 'Sri Balaji',
    paymentMethod: 'UPI',
    accountName: 'HDFC UPI',
    amount: '1200',
  },
  {
    id: 'k2',
    entryDate: '2020-01-05',
    customerId: 'rtc',
    customerName: 'RTC Depot',
    paymentMethod: 'Cash',
    accountName: 'Cash in Hand',
    amount: '500',
  },
];

type Answer = { data: unknown } | 'fail';

function stubApi(answers: Record<string, Answer>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const path = Object.keys(answers)
      .sort((a, b) => b.length - a.length)
      .find((p) => url.includes(p));
    const answer = path ? answers[path] : { data: [] };
    if (answer === 'fail') {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'INTERNAL', message: 'boom' } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ success: true, data: answer.data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const API = {
  '/transactions/customers': { data: CUSTOMERS },
  '/reports/receivables': { data: RECEIVABLES },
  '/transactions/collections': { data: COLLECTIONS },
} satisfies Record<string, Answer>;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  __resetNavIntentForTests();
});

/** The KPI tile whose label reads `label` (the label's row sits beside the `.kpi-value`). */
const tile = (label: string): HTMLElement => {
  const found = screen
    .getAllByText(label)
    .map((el) => el.parentElement?.parentElement)
    .find((el) => el?.querySelector(':scope > .kpi-value'));
  if (!found) throw new Error(`No tile "${label}"`);
  return found;
};

describe('Customers list (#527)', () => {
  it('shows the four tiles with their periods, from the server summary', async () => {
    stubApi(API);
    renderWithProviders(<CustomersList selectedStation={station} userRole="Owner" />);
    await screen.findAllByText('₹3,92,000.00');
    expect(within(tile('Receivable')).getByText('₹3,92,000.00')).toBeTruthy();
    expect(within(tile('Overdue')).getByText('₹3,62,000.00')).toBeTruthy();
    expect(within(tile('Over credit limit')).getByText('1')).toBeTruthy();
    // Overdue (30+ days bucket) amber, Over limit red; the rest plain.
    expect(tile('Overdue').getAttribute('data-alert')).toBe('warning');
    expect(tile('Over credit limit').getAttribute('data-alert')).toBe('danger');
    expect(tile('Receivable').getAttribute('data-alert')).toBeNull();
    expect(screen.getAllByText('Now').length).toBe(3);
    expect(screen.getByText(month)).toBeTruthy();
    // Collected this month counts only this month's entry date.
    expect(within(tile('Collected')).getByText('₹1,200.00')).toBeTruthy();
  });

  it('filters with chips that carry counts; a total row only when filtered', async () => {
    stubApi(API);
    renderWithProviders(<CustomersList selectedStation={station} userRole="Owner" />);
    const chips = await screen.findByRole('radiogroup', { name: 'Show customers' });
    await waitFor(() =>
      expect(within(chips).getByRole('radio', { name: 'Overdue, 1' })).toBeTruthy(),
    );
    expect(within(chips).getByRole('radio', { name: 'All, 4' })).toBeTruthy();
    expect(within(chips).getByRole('radio', { name: 'Over limit, 1' })).toBeTruthy();
    expect(within(chips).getByRole('radio', { name: 'Paid up, 1' })).toBeTruthy();

    const table = screen.getByRole('table');
    // Unfiltered, the Receivable tile carries the total.
    expect(within(table).queryByText(/^Total/)).toBeNull();
    expect(within(table).getByText('₹2,500.00 advance')).toBeTruthy();
    expect(within(table).getByText('Over limit')).toBeTruthy();
    expect(within(table).getByText('Overdue 47d')).toBeTruthy();
    expect(within(table).getByText('Inactive')).toBeTruthy();

    fireEvent.click(within(chips).getByRole('radio', { name: 'Overdue, 1' }));
    expect(within(table).queryByText('Sri Balaji')).toBeNull();
    expect(within(table).getByText('RTC Depot')).toBeTruthy();
    expect(within(table).getByText('Total of 1 shown')).toBeTruthy();

    // An advance is not a receivable: the total says it leaves it out.
    fireEvent.click(within(chips).getByRole('radio', { name: 'Paid up, 1' }));
    expect(within(table).getByText('Total of 1 shown, excl. advances')).toBeTruthy();
  });

  it('an inactive customer who still owes shows their balance, not ₹0', async () => {
    // The summary lists active customers only; the row falls back to the stored balance.
    stubApi(API);
    renderWithProviders(<CustomersList selectedStation={station} userRole="Owner" />);
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('Overdue 47d')).toBeTruthy());
    const row = within(table).getByText('Calicut Couriers').closest('tr') as HTMLElement;
    expect(within(row).getByText('₹54,100.00')).toBeTruthy();
    expect(within(row).queryByText('Paid up')).toBeNull();
  });

  it('a failed receivables request puts only the receivable tiles behind Retry', async () => {
    stubApi({ ...API, '/reports/receivables': 'fail' });
    renderWithProviders(<CustomersList selectedStation={station} userRole="Owner" />);
    expect(await screen.findByText(/Couldn't load receivable/)).toBeTruthy();
    expect(screen.getByText(/Couldn't load overdue/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(2);
    // Over credit limit (on stored balances) and Collected still read.
    await waitFor(() => expect(within(tile('Collected')).getByText('₹1,200.00')).toBeTruthy());
    expect(within(tile('Over credit limit')).getByText('1')).toBeTruthy();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('RTC Depot')).toBeTruthy();
    // No summary, no total: the list never adds up stored balances.
    fireEvent.click(screen.getByRole('radio', { name: /Over limit/ }));
    expect(within(table).queryByText(/^Total/)).toBeNull();
  });

  it('a failed customers request leaves the page frame and tabs in place', async () => {
    stubApi({ ...API, '/transactions/customers': 'fail' });
    renderWithProviders(<CustomersList selectedStation={station} userRole="Owner" />);
    expect(await screen.findByText(/Couldn't load customers/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Customers', level: 1 })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Customers' })).toBeTruthy();
  });

  it('Staff never request receivables and see no Overdue filter', async () => {
    const fetchMock = stubApi(API);
    renderWithProviders(<CustomersList selectedStation={station} userRole="Staff" />);
    const chips = await screen.findByRole('radiogroup', { name: 'Show customers' });
    await within(chips).findByRole('radio', { name: 'All, 4' });
    expect(within(chips).queryByRole('radio', { name: /Overdue/ })).toBeNull();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/reports/receivables'))).toBe(
      false,
    );
  });
});

describe('Customer statement (#527)', () => {
  it('says "Owes you" with the server figure and the type and status as chips', async () => {
    stubApi(API);
    act(() => publishNavIntent({ focusCustomerId: 'rtc', open: 'customer-statement' }));
    renderWithProviders(<CustomersList selectedStation={station} userRole="Owner" />);
    const dialog = (await screen.findByText('Owes you')).closest('section') as HTMLElement;
    await waitFor(() => expect(within(dialog).getByText('₹3,62,000.00')).toBeTruthy());
    expect(within(dialog).getByText('Fleet')).toBeTruthy();
    expect(within(dialog).getByText('Over limit')).toBeTruthy();
    expect(within(dialog).queryByText(/Outstanding/)).toBeNull();
  });
});

describe('Collections ledger (#527)', () => {
  it('filters by method with chips that carry counts', async () => {
    stubApi(API);
    renderWithProviders(<CustomersList selectedStation={station} userRole="Owner" />);
    fireEvent.click(await screen.findByRole('tab', { name: /Collections/ }));
    const chips = await screen.findByRole('radiogroup', { name: 'Filter by method' });
    expect(
      within(chips)
        .getAllByRole('radio')
        .map((r) => r.getAttribute('aria-label')),
    ).toEqual(['All, 1', 'Cash, 0', 'Card, 0', 'UPI, 1', 'Bank, 0']);
    fireEvent.click(within(chips).getByRole('radio', { name: 'Cash, 0' }));
    expect(screen.getByText('No matching collections')).toBeTruthy();
  });

  it('opens on this month by entry date with a total row', async () => {
    stubApi(API);
    renderWithProviders(<CustomersList selectedStation={station} userRole="Owner" />);
    fireEvent.click(await screen.findByRole('tab', { name: /Collections/ }));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Sri Balaji')).toBeTruthy();
    expect(within(table).queryByText('RTC Depot')).toBeNull();
    expect(within(table).getByText('Total')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

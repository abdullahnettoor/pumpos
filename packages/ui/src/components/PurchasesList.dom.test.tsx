/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders.js';
import { computeRange } from '../pump-ds/index.js';
import { shortMonth } from '../utils/format.js';
import { PurchasesList } from './PurchasesList.js';

/**
 * The Suppliers page on the shared modules (#528): Page Frame, layout B for
 * the balance list and both ledgers, Data Section per region, Table module,
 * status vocabulary and the money words (Payable, You owe, Advance).
 */

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
} as any;

const clock = { timeZone: 'Asia/Kolkata' };
const today = computeRange('today', clock).from;
const lastMonth = computeRange('last-month', clock).from;
const monthName = shortMonth(Number(today.slice(5, 7)));

const SUPPLIERS = [
  { id: 's1', name: 'IOCL Depot', isActive: true, currentBalance: '1000.00', metadata: {} },
  { id: 's2', name: 'HPCL Terminal', isActive: true, currentBalance: '-250.00', metadata: {} },
  { id: 's3', name: 'Old Lubes', isActive: false, currentBalance: '0', metadata: {} },
];

const PURCHASES = [
  {
    id: 'p1',
    supplierName: 'IOCL Depot',
    entryDate: today,
    invoiceNumber: 'INV-NEW',
    documentNumber: 'PUR-2',
    amount: '700.00',
    businessDayId: null,
    awaitingDecantation: true,
  },
  {
    id: 'p2',
    supplierName: 'HPCL Terminal',
    entryDate: lastMonth,
    invoiceNumber: 'INV-OLD',
    documentNumber: 'PUR-1',
    amount: '300.00',
    businessDayId: 'bd-1',
  },
];

const PAYMENTS = [
  {
    id: 'y1',
    supplierId: 's2',
    supplierName: 'HPCL Terminal',
    entryDate: today,
    amount: '550.00',
    accountName: 'SBI Current',
    accountType: 'BANK',
    notes: 'NEFT',
  },
  {
    id: 'y2',
    supplierId: 's1',
    supplierName: 'IOCL Depot',
    entryDate: today,
    amount: '50.00',
    accountName: 'Cash in Hand',
    accountType: 'CASH_IN_HAND',
    notes: null,
  },
];

type Answer = { data: unknown } | 'fail';

/** Answers each API path (longest match wins); anything unlisted answers an empty list. */
function stubApi(answers: Record<string, Answer>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const path = Object.keys(answers)
      .sort((a, b) => b.length - a.length)
      .find((p) => url.includes(p));
    const answer = path ? answers[path] : { data: [] };
    if (answer === 'fail')
      return new Response(
        JSON.stringify({ success: false, error: { code: 'INTERNAL', message: 'boom' } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    return new Response(JSON.stringify({ success: true, data: answer.data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const DATA: Record<string, Answer> = {
  '/transactions/suppliers': { data: SUPPLIERS },
  '/transactions/purchases': { data: PURCHASES },
  '/transactions/supplier-payments': { data: PAYMENTS },
};

/** The KPI tile whose label reads `label` (the word may also head a column or a chip). */
const tileOf = (label: string) => {
  const tile = screen
    .getAllByText(label)
    .map((el) => el.parentElement?.parentElement)
    .find((t) => t?.querySelector('.kpi-value'));
  if (!tile) throw new Error(`no tile "${label}"`);
  return tile;
};
const before = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const totalRow = (table: HTMLElement) => within(table.querySelector('tfoot') as HTMLElement);
const RED_OR_GREEN = /\b(text|fill|bg)-(danger|success)-(fg|bg)\b/;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/;

beforeEach(() => {
  stubApi(DATA);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Suppliers page (#528)', () => {
  it('is titled from the sidebar and has the tabs Suppliers · Purchases · Payments', async () => {
    renderWithProviders(<PurchasesList selectedStation={station} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Suppliers');
    const tabs = within(screen.getByRole('tablist', { name: 'Suppliers' })).getAllByRole('tab');
    expect(tabs.map((t) => t.querySelector('[data-tab-label]')?.textContent)).toEqual([
      'Suppliers',
      'Purchases',
      'Payments',
    ]);
  });

  it('the supplier list is layout B: four period-chipped tiles, then the list header and its controls', async () => {
    renderWithProviders(<PurchasesList selectedStation={station} />);
    const table = await screen.findByRole('table');
    const header = screen.getByTestId('section-header-suppliers');
    const bar = within(header).getByTestId('control-bar');
    expect(within(bar).getByRole('searchbox')).toBeTruthy();
    expect(within(bar).getByRole('radiogroup', { name: 'Supplier balance' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'About supplier balances' })).toBeTruthy();
    expect(screen.getAllByTestId('control-bar')).toHaveLength(1);

    const chips: [string, string, string][] = [
      ['Payable', 'Now', '₹1,000.00'],
      ['Purchased', monthName, '₹700.00'],
      ['Paid', monthName, '₹600.00'],
      ['Advance paid', 'Now', '₹250.00'],
    ];
    for (const [label, chip, value] of chips) {
      const tile = tileOf(label);
      expect(before(tile, header)).toBe(true);
      expect(within(tile).getByText(chip)).toBeTruthy();
      expect(within(tile).getByText(value)).toBeTruthy();
      expect(tile.getAttribute('data-alert')).toBeNull();
    }
    // The balance column is net; the total row says so.
    expect(totalRow(table).getByText('Total, net of advances')).toBeTruthy();
    expect(totalRow(table).getByText('₹750.00')).toBeTruthy();
  });

  it('filters rows at once with counted chips; Inactive is grey', async () => {
    renderWithProviders(<PurchasesList selectedStation={station} />);
    const table = await screen.findByRole('table');
    const group = screen.getByRole('radiogroup', { name: 'Supplier balance' });
    expect(within(group).getByRole('radio', { name: 'All, 3' })).toBeTruthy();
    expect(within(group).getByRole('radio', { name: 'Payable, 1' })).toBeTruthy();
    expect(within(group).getByRole('radio', { name: 'Advance, 1' })).toBeTruthy();
    const inactive = within(group).getByRole('radio', { name: 'Inactive, 1' });
    expect(inactive.querySelector('[data-tone]')?.getAttribute('data-tone')).toBe('neutral');
    fireEvent.click(inactive);
    expect(within(table).queryByText('IOCL Depot')).toBeNull();
    expect(within(table).getByText('Old Lubes')).toBeTruthy();
    expect(totalRow(table).getByText('Total')).toBeTruthy();
  });

  it('the statement says "You owe", and an advance reads "Advance paid", never a negative', async () => {
    renderWithProviders(<PurchasesList selectedStation={station} />);
    fireEvent.click(await screen.findByRole('button', { name: 'IOCL Depot' }));
    let balance = await screen.findByTestId('supplier-balance');
    expect(balance.textContent).toBe('You owe₹1,000.00');
    fireEvent.click(screen.getByRole('button', { name: 'Close Drawer' }));

    fireEvent.click(await screen.findByRole('button', { name: 'HPCL Terminal' }));
    balance = await screen.findByTestId('supplier-balance');
    expect(balance.textContent).toBe('Advance paid₹250.00');
    expect(balance.innerHTML).not.toMatch(RED_OR_GREEN);
  });

  it('Purchases is a ledger: tiles fixed, the range in its header filters only the table', async () => {
    renderWithProviders(<PurchasesList selectedStation={station} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Purchases/ }));
    const table = await screen.findByRole('table');
    const header = screen.getByTestId('section-header-purchases');
    expect(within(header).getByRole('button', { name: /Purchases period/ })).toBeTruthy();
    expect(within(table).getByText('INV-NEW')).toBeTruthy();
    expect(within(table).queryByText('INV-OLD')).toBeNull();
    expect(within(table).getByText('Awaiting decantation')).toBeTruthy();
    const awaiting = tileOf('Awaiting decantation');
    expect(awaiting.getAttribute('data-alert')).toBe('warning');
    expect(totalRow(table).getByText('₹700.00')).toBeTruthy();

    fireEvent.click(within(header).getByRole('button', { name: /Purchases period/ }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Last month/ }));
    await waitFor(() => expect(within(table).getByText('INV-OLD')).toBeTruthy());
    expect(within(table).queryByText('INV-NEW')).toBeNull();
    // The month tile keeps reading this month.
    expect(within(tileOf('Purchased this month')).getByText('₹700.00')).toBeTruthy();
    expect(table.innerHTML).not.toMatch(RED_OR_GREEN);
    expect(document.body.textContent).not.toMatch(ISO_DATE);
  });

  it('Payments lists Supplier Payments with their Funding Account and a total', async () => {
    renderWithProviders(<PurchasesList selectedStation={station} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Payments/ }));
    const table = await screen.findByRole('table');
    expect(screen.getByTestId('section-header-supplier-payments')).toBeTruthy();
    expect(within(table).getByText('SBI Current')).toBeTruthy();
    expect(within(table).getByText('Bank')).toBeTruthy();
    expect(totalRow(table).getByText('₹600.00')).toBeTruthy();
    expect(within(tileOf('From cash in hand / petty')).getByText('₹50.00')).toBeTruthy();
    expect(within(tileOf('From bank / owner')).getByText('₹550.00')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Record supplier payment/ }).className).toContain(
      'bg-brand',
    );
  });

  it('a failed load shows "Couldn\'t load … · Retry" in each section, never a page error', async () => {
    const fetchMock = stubApi({ ...DATA, '/transactions/suppliers': 'fail' });
    renderWithProviders(<PurchasesList selectedStation={station} />);
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent?.replace(/ ·.*/, ''))).toEqual([
      "Couldn't load supplier totals",
      "Couldn't load suppliers",
    ]);
    expect(screen.queryByText(/^Error:/)).toBeNull();
    const calls = () =>
      fetchMock.mock.calls.filter(([u]) => String(u).includes('/transactions/suppliers')).length;
    const n = calls();
    fireEvent.click(within(alerts[1]).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(calls()).toBeGreaterThan(n));
  });
});

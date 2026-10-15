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
import {
  getNavIntentState,
  publishNavIntent,
  __resetNavIntentForTests,
} from '../nav-intent/store.js';

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

/** The server's payables summary: deliberately not the sum of the lists above. */
const PAYABLES = {
  total: 1234.5,
  supplierCount: 1,
  month: {
    purchased: 4321,
    paid: 987,
    purchasedMonth: today.slice(0, 7),
    paidMonth: today.slice(0, 7),
  },
  suppliers: [],
};

const DATA: Record<string, Answer> = {
  '/transactions/suppliers': { data: SUPPLIERS },
  '/transactions/purchases': { data: PURCHASES },
  '/transactions/supplier-payments': { data: PAYMENTS },
  '/reports/payables': { data: PAYABLES },
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
  __resetNavIntentForTests();
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

  it('the supplier list is layout B: server tiles with period chips, then the list header and its controls', async () => {
    renderWithProviders(<PurchasesList selectedStation={station} />);
    const table = await screen.findByRole('table');
    const header = screen.getByTestId('section-header-suppliers');
    const bar = within(header).getByTestId('control-bar');
    expect(within(bar).getByRole('searchbox')).toBeTruthy();
    expect(within(bar).getByRole('radiogroup', { name: 'Supplier balance' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'About supplier balances' })).toBeTruthy();
    expect(screen.getAllByTestId('control-bar')).toHaveLength(1);

    // Payable, Purchased and Paid are the server's figures, never sums of the lists.
    const chips: [string, string, string][] = [
      ['Payable', 'Now', '₹1,234.50'],
      ['Purchased', monthName, '₹4,321.00'],
      ['Paid', monthName, '₹987.00'],
      ['Advance paid', 'Now', '₹250.00'],
    ];
    await screen.findByText('₹1,234.50');
    for (const [label, chip, value] of chips) {
      const tile = tileOf(label);
      expect(before(tile, header)).toBe(true);
      expect(within(tile).getByText(chip)).toBeTruthy();
      expect(within(tile).getByText(value)).toBeTruthy();
      expect(tile.getAttribute('data-alert')).toBeNull();
    }
    // Unfiltered, the Payable tile carries the total: no total row.
    expect(table.querySelector('tfoot')).toBeNull();
  });

  it('filters rows at once with counted chips; a filtered list totals the rows shown', async () => {
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
    expect(totalRow(table).getByText('Total of 1 shown')).toBeTruthy();

    fireEvent.click(within(group).getByRole('radio', { name: 'All, 3' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Terminal' } });
    expect(totalRow(table).getByText('Total of 1 shown, net of advances')).toBeTruthy();
    expect(screen.getByTestId('section-header-suppliers').textContent).toContain('1 of 3');
  });

  it('every tab carries the same actions: Add supplier, Record supplier payment, Record purchase (primary)', async () => {
    renderWithProviders(<PurchasesList selectedStation={station} />);
    for (const tab of [/Suppliers/, /Purchases/, /Payments/]) {
      fireEvent.click(await screen.findByRole('tab', { name: tab }));
      const add = screen.getByRole('button', { name: 'Add supplier' });
      const pay = screen.getByRole('button', { name: 'Record supplier payment' });
      const buy = screen.getByRole('button', { name: 'Record purchase' });
      expect(add.className).not.toContain('bg-brand');
      expect(pay.className).not.toContain('bg-brand');
      expect(buy.className).toContain('bg-brand');
    }
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
    const chip = within(table).getByText('Awaiting decantation');
    expect(chip.closest('[class*="bg-"]')?.className).not.toMatch(/warning|danger/);
    // A count of purchases to link is a state, not a problem: no alert.
    const awaiting = tileOf('Awaiting decantation');
    expect(awaiting.getAttribute('data-alert')).toBeNull();
    expect(within(awaiting).getByText('1')).toBeTruthy();
    expect(within(tileOf('Purchased today')).getByText('₹700.00')).toBeTruthy();
    expect(within(tileOf('Payable')).getByText('₹1,234.50')).toBeTruthy();
    expect(totalRow(table).getByText('₹700.00')).toBeTruthy();

    fireEvent.click(within(header).getByRole('button', { name: /Purchases period/ }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Last month/ }));
    await waitFor(() => expect(within(table).getByText('INV-OLD')).toBeTruthy());
    expect(within(table).queryByText('INV-NEW')).toBeNull();
    // The today tile keeps reading today.
    expect(within(tileOf('Purchased today')).getByText('₹700.00')).toBeTruthy();
    expect(table.innerHTML).not.toMatch(RED_OR_GREEN);
    expect(document.body.textContent).not.toMatch(ISO_DATE);
  });

  it('Payments reads its range from the server; one Paid tile with its split; a row opens the statement', async () => {
    const fetchMock = stubApi(DATA);
    renderWithProviders(<PurchasesList selectedStation={station} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Payments/ }));
    const table = await screen.findByRole('table');
    expect(screen.getByTestId('section-header-supplier-payments')).toBeTruthy();
    expect(within(table).getByText('SBI Current')).toBeTruthy();
    expect(within(table).getByText('Bank')).toBeTruthy();
    expect(totalRow(table).getByText('₹600.00')).toBeTruthy();

    const paid = tileOf('Paid');
    expect(within(paid).getByText('₹600.00')).toBeTruthy();
    expect(within(paid).getByText('₹50.00 cash · ₹550.00 bank / owner')).toBeTruthy();
    expect(within(tileOf('Suppliers paid')).getByText('2')).toBeTruthy();
    expect(within(tileOf('Paid today')).getByText('₹600.00')).toBeTruthy();
    expect(screen.queryByText('From cash in hand / petty')).toBeNull();

    const month = computeRange('this-month', clock);
    const paymentUrls = () =>
      fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('supplier-payments'));
    expect(paymentUrls().some((u) => u.includes(`from=${month.from}`))).toBe(true);
    const header = screen.getByTestId('section-header-supplier-payments');
    fireEvent.click(within(header).getByRole('button', { name: /Supplier payments period/ }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: /Last month/ }));
    const last = computeRange('last-month', clock);
    await waitFor(() =>
      expect(paymentUrls().some((u) => u.includes(`from=${last.from}&to=${last.to}`))).toBe(true),
    );

    fireEvent.click(await within(await screen.findByRole('table')).findByText('NEFT'));
    expect((await screen.findByTestId('supplier-balance')).textContent).toBe('Advance paid₹250.00');
  });

  it('a failed payments call hides only the tiles that read it', async () => {
    stubApi({ ...DATA, '/transactions/supplier-payments': 'fail' });
    renderWithProviders(<PurchasesList selectedStation={station} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Payments/ }));
    expect(await screen.findByText("Couldn't load paid this month", { exact: false })).toBeTruthy();
    expect(await screen.findByText('₹1,234.50')).toBeTruthy();
  });

  it('a failed month request leaves Paid today and Payable standing, whatever the range (#575)', async () => {
    const month = computeRange('this-month', clock);
    stubApi({
      ...DATA,
      [`/transactions/supplier-payments?stationId=st-1&from=${month.from}&to=${month.to}`]: 'fail',
    });
    renderWithProviders(<PurchasesList selectedStation={station} />);
    fireEvent.click(await screen.findByRole('tab', { name: /Payments/ }));
    expect(await screen.findByText("Couldn't load paid this month", { exact: false })).toBeTruthy();
    expect(within(tileOf('Paid today')).getByText('₹600.00')).toBeTruthy();
    expect(within(tileOf('Payable')).getByText('₹1,234.50')).toBeTruthy();
  });

  it('a failed load shows "Couldn\'t load … · Retry" in each section, never a page error', async () => {
    const fetchMock = stubApi({ ...DATA, '/transactions/suppliers': 'fail' });
    renderWithProviders(<PurchasesList selectedStation={station} />);
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent?.replace(/ ·.*/, ''))).toEqual([
      "Couldn't load advances",
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

/**
 * Supplier figures are per Station (#575): each pump has its own account with
 * its OMC. Highway buys from BPCL, City from IOCL, both from a shared lube
 * distributor. The server answers each Station with its own list and payables.
 */
describe('Suppliers page per Station (#575)', () => {
  const HIGHWAY = station;
  const CITY = { ...station, id: 'st-2', name: 'City Fuels' };
  const LISTS: Record<string, unknown[]> = {
    'st-1': [
      { id: 'bpcl', name: 'BPCL Kochi', isActive: true, currentBalance: '60000.00', metadata: {} },
      { id: 'lube', name: 'Lube Co', isActive: true, currentBalance: '4000.00', metadata: {} },
    ],
    'st-2': [
      {
        id: 'iocl',
        name: 'IOCL Ernakulam',
        isActive: true,
        currentBalance: '70000.00',
        metadata: {},
      },
      { id: 'lube', name: 'Lube Co', isActive: true, currentBalance: '-2000.00', metadata: {} },
    ],
  };
  const payablesOf = (total: number, supplierCount: number) => ({
    ...PAYABLES,
    total,
    supplierCount,
  });
  const PAYABLES_AT: Record<string, unknown> = {
    'st-1': payablesOf(64000, 2),
    'st-2': payablesOf(70000, 1),
  };

  /** Answers by path and by the `stationId` the request names. */
  function stubStations() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://api.test');
      const stationId = url.searchParams.get('stationId') ?? '';
      const data = url.pathname.endsWith('/transactions/suppliers')
        ? (LISTS[stationId] ?? [])
        : url.pathname.endsWith('/reports/payables')
          ? PAYABLES_AT[stationId]
          : url.pathname.includes('/ledger')
            ? []
            : [];
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  const payableTotal = async () => {
    const table = await screen.findByRole('table');
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Supplier balance' })).getByRole('radio', {
        name: /^Payable/,
      }),
    );
    return within(table.querySelector('tfoot') as HTMLElement);
  };

  it("asks for the Station's list, balances and payables, and shows none of another Station's suppliers", async () => {
    const fetchMock = stubStations();
    renderWithProviders(<PurchasesList selectedStation={HIGHWAY} />);
    const table = await screen.findByRole('table');
    expect(within(table).getByText('BPCL Kochi')).toBeTruthy();
    expect(within(table).queryByText('IOCL Ernakulam')).toBeNull();
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(
      urls.some((u) => u.includes('/transactions/suppliers?') && u.includes('stationId=st-1')),
    ).toBe(true);
    expect(urls.some((u) => u.includes('/reports/payables?stationId=st-1'))).toBe(true);
    expect(urls.some((u) => u.includes('stationId=st-2'))).toBe(false);
  });

  it.each([
    ['Highway', HIGHWAY, '₹64,000.00'],
    ['City', CITY, '₹70,000.00'],
  ])('the Payable tile equals the total of the %s list owed', async (_name, at, owed) => {
    stubStations();
    renderWithProviders(<PurchasesList selectedStation={at} />);
    await waitFor(() => expect(within(tileOf('Payable')).getByText(owed)).toBeTruthy());
    expect((await payableTotal()).getByText(owed)).toBeTruthy();
  });

  it('a deep link to a supplier this Station does not list says so, then clears', async () => {
    stubStations();
    publishNavIntent({ focusSupplierId: 'iocl', open: 'supplier-statement' });
    renderWithProviders(<PurchasesList selectedStation={HIGHWAY} />);
    expect(
      await screen.findByText(
        'That supplier has no account at Highway Fuels. Switch to its station to see its statement.',
      ),
    ).toBeTruthy();
    expect(getNavIntentState().intent).toBeNull();
    expect(screen.queryByTestId('supplier-balance')).toBeNull();
  });

  it('a deep link to a supplier this Station lists opens its statement', async () => {
    stubStations();
    publishNavIntent({ focusSupplierId: 'lube', open: 'supplier-statement' });
    renderWithProviders(<PurchasesList selectedStation={HIGHWAY} />);
    expect((await screen.findByTestId('supplier-balance')).textContent).toBe('You owe₹4,000.00');
  });

  it('a shared supplier shows each Station its own share, row and statement alike', async () => {
    const fetchMock = stubStations();
    renderWithProviders(<PurchasesList selectedStation={CITY} />);
    const table = await screen.findByRole('table');
    expect(within(table).queryByText('BPCL Kochi')).toBeNull();
    // At City the distributor is 2,000 paid ahead; at Highway 4,000 is owed.
    expect(within(tileOf('Advance paid')).getByText('₹2,000.00')).toBeTruthy();
    fireEvent.click(within(table).getByRole('button', { name: 'Lube Co' }));
    expect((await screen.findByTestId('supplier-balance')).textContent).toBe(
      'Advance paid₹2,000.00',
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) =>
          String(u).includes('/transactions/suppliers/lube/ledger?stationId=st-2'),
        ),
      ).toBe(true),
    );
  });
});

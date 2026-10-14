/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { computeRange } from '../../pump-ds/index.js';
import { formatDateSpan } from '../../utils/format.js';
import { ExpensesList } from '../ExpensesList.js';
import { IncomeList } from '../IncomeList.js';

/**
 * Expenses and Income on the shared modules (#529): Page Frame, Section
 * header, Data Section, Table module, status vocabulary. The two pages are one
 * view with the kind as a parameter, so they read the same apart from it.
 */

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
} as any;

const today = computeRange('today', { timeZone: 'Asia/Kolkata' }).from;
const month = computeRange('this-month', { timeZone: 'Asia/Kolkata' });
const monthName = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-IN', {
  month: 'short',
  timeZone: 'UTC',
});

const record = (id: string, amount: number, status = 'ACTIVE', categoryName = 'Electricity') => ({
  id,
  entryDate: today,
  categoryId: 'c1',
  categoryName,
  description: `Entry ${id}`,
  amount: String(amount),
  accountName: 'Cash in Hand',
  accountType: 'CASH_IN_HAND',
  status,
});

const RECORDS = [
  record('r1', 1000),
  record('r2', 250, 'ACTIVE', 'Repairs'),
  record('r3', 400, 'VOIDED'),
  record('r4', 50, 'ADJUSTMENT', 'Repairs'),
];

const GST_ROWS = [
  {
    id: 'g1',
    entryDate: today,
    categoryName: 'Shop Rent',
    hsnCode: '997212',
    payer: 'Kerala Tyres',
    gstRate: 18,
    taxableAmount: 1000,
    cgst: 90,
    sgst: 90,
    igst: 0,
    cess: 0,
    amount: 1180,
  },
  {
    id: 'g2',
    entryDate: today,
    categoryName: 'Shop Rent',
    payer: 'ATM kiosk',
    gstRate: 18,
    interState: true,
    taxableAmount: 500,
    cgst: 0,
    sgst: 0,
    igst: 90,
    cess: 0,
    amount: 590,
  },
];

type Answer = { data: unknown } | 'fail' | 'hang';

/** Answers each API path; anything unlisted answers an empty list. */
function stubApi(answers: Record<string, Answer>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const path = Object.keys(answers)
      .sort((a, b) => b.length - a.length)
      .find((p) => url.includes(p));
    const answer = path ? answers[path] : { data: [] };
    if (answer === 'hang') return new Promise<Response>(() => {});
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

const PAGES = {
  expense: {
    path: '/transactions/expenses',
    render: () => <ExpensesList selectedStation={station} userRole="Owner" />,
    noun: 'expenses',
  },
  income: {
    path: '/transactions/income',
    render: () => <IncomeList selectedStation={station} userRole="Owner" onNavigate={() => {}} />,
    noun: 'income',
  },
} as const;

const headers = (table: HTMLElement) =>
  within(table)
    .getAllByRole('columnheader')
    .map((th) => th.textContent?.replace(/[↑↓]/g, '').trim());

const totalRow = (table: HTMLElement) => {
  const foot = table.querySelector('tfoot');
  if (!foot) throw new Error('no total row');
  return within(foot as HTMLElement);
};

beforeEach(() => {
  stubApi({});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Expenses and Income read the same apart from the kind (#529)', () => {
  it('the ledger has the same columns, header and total on both pages', async () => {
    const seen: Record<string, unknown> = {};
    for (const kind of ['expense', 'income'] as const) {
      stubApi({ [PAGES[kind].path]: { data: RECORDS } });
      renderWithProviders(PAGES[kind].render());
      const table = await screen.findByRole('table');
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
        kind === 'expense' ? 'Expenses' : 'Income',
      );
      expect(screen.getByTestId(`section-header-${kind}-ledger`)).toBeTruthy();
      // Voided entries stay listed, struck, but add nothing to the total.
      expect(totalRow(table).getByText('₹1,300.00')).toBeTruthy();
      seen[kind] = headers(table);
      cleanup();
    }
    expect(seen.income).toEqual(seen.expense);
  });

  it('By category has the same columns and total on both pages', async () => {
    const seen: Record<string, unknown> = {};
    for (const kind of ['expense', 'income'] as const) {
      stubApi({ [PAGES[kind].path]: { data: RECORDS } });
      renderWithProviders(PAGES[kind].render());
      fireEvent.click(await screen.findByRole('tab', { name: /By category/ }));
      const table = await screen.findByRole('table');
      expect(within(table).getByText('Repairs')).toBeTruthy();
      expect(totalRow(table).getByText('₹1,300.00')).toBeTruthy();
      seen[kind] = headers(table);
      cleanup();
    }
    expect(seen.income).toEqual(seen.expense);
  });

  it.each(['expense', 'income'] as const)(
    '%s: Voided and Adjustment read in the status vocabulary',
    async (kind) => {
      stubApi({ [PAGES[kind].path]: { data: RECORDS } });
      renderWithProviders(PAGES[kind].render());
      const table = await screen.findByRole('table');
      expect(within(table).getByText('Voided')).toBeTruthy();
      expect(within(table).getByText('Adjustment')).toBeTruthy();
    },
  );

  it.each(['expense', 'income'] as const)('%s: the anchoring note is an InfoTip', async (kind) => {
    stubApi({ [PAGES[kind].path]: { data: RECORDS } });
    renderWithProviders(PAGES[kind].render());
    const about = await screen.findByRole('button', { name: `About ${kind} anchoring` });
    fireEvent.click(about);
    expect(screen.getByRole('tooltip').textContent).toMatch(/never touch(es)? a shift drawer/);
  });
});

describe('each data region loads on its own (#529)', () => {
  it.each(['expense', 'income'] as const)(
    '%s: loading shows skeletons, never a "Loading…" empty state',
    async (kind) => {
      stubApi({ [PAGES[kind].path]: 'hang' });
      renderWithProviders(PAGES[kind].render());
      expect(await screen.findByLabelText(`Loading ${PAGES[kind].noun}`)).toBeTruthy();
      expect(screen.queryByText('Loading…')).toBeNull();
    },
  );

  it.each(['expense', 'income'] as const)(
    '%s: a failed load offers Retry in its section, never the empty state',
    async (kind) => {
      const fetchMock = stubApi({ [PAGES[kind].path]: 'fail' });
      renderWithProviders(PAGES[kind].render());
      const alerts = await screen.findAllByRole('alert');
      // The totals and the ledger each say so, each with its own Retry.
      expect(alerts.map((a) => a.textContent?.replace(/ ·.*/, ''))).toEqual([
        `Couldn't load ${kind} totals`,
        `Couldn't load ${PAGES[kind].noun}`,
      ]);
      const alert = alerts[1];
      expect(screen.queryByText(/yet/)).toBeNull();
      const calls = () =>
        fetchMock.mock.calls.filter(([u]) => String(u).includes(PAGES[kind].path)).length;
      const before = calls();
      fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(calls()).toBeGreaterThan(before));
    },
  );

  it.each(['expense', 'income'] as const)(
    '%s: nothing recorded yet shows the real empty state',
    async (kind) => {
      renderWithProviders(PAGES[kind].render());
      expect(await screen.findByText(`No ${PAGES[kind].noun} yet`)).toBeTruthy();
    },
  );
});

/** Elements in document order: true when `a` comes before `b`. */
const before = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

const RED_OR_GREEN = /\b(text|fill|bg)-(danger|success)-(fg|bg)\b/;

describe('owner decisions for the pilot (#566)', () => {
  it.each(['expense', 'income'] as const)(
    '%s ledger is layout B: period-chipped tiles on top, controls in the ledger header',
    async (kind) => {
      stubApi({ [PAGES[kind].path]: { data: RECORDS } });
      renderWithProviders(PAGES[kind].render());
      await screen.findByRole('table');
      const header = screen.getByTestId(`section-header-${kind}-ledger`);
      const bar = within(header).getByTestId('control-bar');
      expect(
        within(bar).getByRole('button', { name: new RegExp(`ledger period`, 'i') }),
      ).toBeTruthy();
      expect(within(bar).getByRole('searchbox')).toBeTruthy();
      expect(within(bar).getByRole('combobox', { name: 'Filter by category' })).toBeTruthy();
      expect(within(bar).getByRole('button', { name: `About ${kind} anchoring` })).toBeTruthy();
      // The Page Frame carries no toolbar of its own: one control bar per table.
      expect(screen.getAllByTestId('control-bar')).toHaveLength(1);

      const label = kind === 'expense' ? 'Spent today' : 'Received today';
      const tile = screen.getByText(label).closest('div')!.parentElement!;
      expect(before(tile, header)).toBe(true);
      expect(within(tile).getByText('Today')).toBeTruthy();
      const monthLabel = kind === 'expense' ? 'Spent this month' : 'Received this month';
      expect(within(screen.getByText(monthLabel).parentElement!).getByText(monthName)).toBeTruthy();
    },
  );

  it.each(['expense', 'income'] as const)(
    '%s By category is layout A: one range bar above "In range" tiles and the table',
    async (kind) => {
      stubApi({ [PAGES[kind].path]: { data: RECORDS } });
      renderWithProviders(PAGES[kind].render());
      fireEvent.click(await screen.findByRole('tab', { name: /By category/ }));
      const table = await screen.findByRole('table');
      const bar = screen.getByTestId('control-bar');
      expect(within(bar).getByRole('button', { name: /by category period/i })).toBeTruthy();
      expect(before(bar, table)).toBe(true);
      expect(screen.getAllByText('In range')).toHaveLength(4);
      // The total names its dates as a span, never raw YYYY-MM-DD.
      const span = formatDateSpan(month.from, month.to, { referenceDate: today });
      const total = screen.getByText(kind === 'expense' ? 'Total expenses' : 'Total income');
      expect(within(total.closest('div')!.parentElement!).getByText(span)).toBeTruthy();
      expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    },
  );

  it.each(['expense', 'income'] as const)(
    '%s: ordinary money is plain, never red or green',
    async (kind) => {
      stubApi({ [PAGES[kind].path]: { data: RECORDS } });
      const { container } = renderWithProviders(PAGES[kind].render());
      const table = await screen.findByRole('table');
      expect(container.querySelector('[data-alert]')).toBeNull();
      for (const el of table.querySelectorAll('[class]')) {
        expect(el.getAttribute('class')).not.toMatch(RED_OR_GREEN);
      }
      fireEvent.click(screen.getByRole('tab', { name: /By category/ }));
      const byCategory = await screen.findByRole('table');
      expect(container.querySelector('[data-alert]')).toBeNull();
      for (const el of byCategory.querySelectorAll('[class]')) {
        expect(el.getAttribute('class')).not.toMatch(RED_OR_GREEN);
      }
    },
  );

  it('the Adjustment chip reads in the info tone, not amber', async () => {
    stubApi({ [PAGES.expense.path]: { data: RECORDS } });
    renderWithProviders(PAGES.expense.render());
    const table = await screen.findByRole('table');
    const chip = within(table).getByText('Adjustment').closest('span[class*="bg-"]')!;
    expect(chip.getAttribute('class')).toMatch(/text-info-fg/);
    expect(chip.getAttribute('class')).not.toMatch(/warning/);
  });

  it('the Funding account names its type only when it differs from the name', async () => {
    stubApi({
      [PAGES.expense.path]: {
        data: [
          record('a1', 100),
          { ...record('a2', 200), accountName: 'SBI Current', accountType: 'BANK' },
        ],
      },
    });
    renderWithProviders(PAGES.expense.render());
    const table = await screen.findByRole('table');
    expect(within(table).getAllByText('Cash in Hand')).toHaveLength(1);
    expect(within(table).getByText('SBI Current')).toBeTruthy();
    expect(within(table).getByText('Bank')).toBeTruthy();
  });
});

describe('Income › GST for Staff (#529)', () => {
  const renderStaff = () =>
    renderWithProviders(
      <IncomeList selectedStation={station} userRole="Staff" onNavigate={() => {}} />,
    );

  it('reads the register on the Table module with a total row', async () => {
    stubApi({ '/transactions/income/gst-register': { data: GST_ROWS } });
    renderStaff();
    fireEvent.click(await screen.findByRole('tab', { name: /GST/ }));
    const table = await screen.findByRole('table');
    expect(headers(table)).toEqual([
      'Date',
      'Category',
      'Payer / Description',
      'Rate',
      'Taxable',
      'CGST',
      'SGST',
      'IGST',
      'Received',
    ]);
    expect(within(table).getByText('18% · IGST')).toBeTruthy();
    expect(within(table).getByText('HSN/SAC 997212')).toBeTruthy();
    const total = totalRow(table);
    expect(total.getByText('₹1,500.00')).toBeTruthy();
    expect(total.getByText('₹1,770.00')).toBeTruthy();
  });

  it('is layout A with no Apply button: a new range applies at once', async () => {
    const fetchMock = stubApi({ '/transactions/income/gst-register': { data: GST_ROWS } });
    renderStaff();
    fireEvent.click(await screen.findByRole('tab', { name: /GST/ }));
    const table = await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    const bar = screen.getByTestId('control-bar');
    expect(before(bar, table)).toBe(true);
    expect(within(bar).getByRole('button', { name: 'About income GST' })).toBeTruthy();
    expect(screen.getAllByText('In range')).toHaveLength(4);
    // Output GST is plain, not a brand or success figure.
    const output = screen.getByText('Output GST').closest('div')!.parentElement!;
    expect(output.querySelector('.kpi-value')!.getAttribute('class')).toMatch(/text-ink-strong/);

    const gstCalls = () =>
      fetchMock.mock.calls
        .map(([u]) => String(u))
        .filter((u) => u.includes('/transactions/income/gst-register'));
    fireEvent.click(within(bar).getByRole('button', { name: /GST period/ }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Last month/ }));
    const last = computeRange('last-month', { timeZone: 'Asia/Kolkata' });
    await waitFor(() => expect(gstCalls().some((u) => u.includes(`from=${last.from}`))).toBe(true));
  });

  it('a failed register offers Retry', async () => {
    stubApi({ '/transactions/income/gst-register': 'fail' });
    renderStaff();
    fireEvent.click(await screen.findByRole('tab', { name: /GST/ }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent?.replace(/ ·.*/, ''))).toEqual([
      "Couldn't load gst totals",
      "Couldn't load gst register",
    ]);
    for (const alert of alerts) {
      expect(within(alert).getByRole('button', { name: 'Retry' })).toBeTruthy();
    }
  });
});

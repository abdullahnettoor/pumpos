/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { computeRange } from '../../pump-ds/index.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatBusinessDate, shortMonth } from '../../utils/format.js';
import {
  getNavIntentState,
  publishNavIntent,
  __resetNavIntentForTests,
} from '../../nav-intent/store.js';
import { AccountsPanel } from './AccountsPanel.js';

/**
 * Accounts on the shared modules (#530): Page Frame with tabs Accounts · Daily
 * cash book · Transfers; the balance list, each statement and the transfers
 * list on layout B; one account-type display; per-section Retry.
 */

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
} as any;

const today = computeRange('today', { timeZone: 'Asia/Kolkata' }).from;
const monthStart = computeRange('this-month', { timeZone: 'Asia/Kolkata' }).from;
const monthName = shortMonth(Number(today.slice(5, 7)));

const ACCOUNTS = [
  {
    id: 'cash',
    name: 'Cash in Hand',
    accountType: 'CASH_IN_HAND',
    balance: '1000',
    isActive: true,
  },
  { id: 'sbi', name: 'SBI Current', accountType: 'BANK', balance: '5000', isActive: true },
  { id: 'bob', name: 'Bank of Baroda', accountType: 'BANK', balance: '-200', isActive: true },
  { id: 'pos', name: 'HDFC POS', accountType: 'MERCHANT_CLEARING', balance: '300', isActive: true },
];

const LEDGER = {
  account: ACCOUNTS[1],
  periodOpeningBalance: '4000',
  entries: [
    {
      id: 'l1',
      direction: 'in',
      amount: '1500',
      entryDate: monthStart,
      sourceType: 'DEPOSIT',
      sourceId: 't1',
      notes: 'Daily banking',
      createdAt: `${monthStart}T06:00:00.000Z`,
    },
    {
      id: 'l2',
      direction: 'out',
      amount: '500',
      entryDate: today,
      sourceType: 'BANK_CHARGE',
      sourceId: 'c1',
      notes: 'Fee',
      createdAt: `${today}T06:00:00.000Z`,
    },
  ],
};

const leg = (
  id: string,
  transferId: string,
  accountId: string,
  direction: 'in' | 'out',
  amount: number,
  sourceType: string,
  entryDate = today,
) => {
  const a = ACCOUNTS.find((x) => x.id === accountId)!;
  return {
    id,
    transferId,
    entryDate,
    accountId,
    accountType: a.accountType,
    accountName: a.name,
    direction,
    amount: String(amount),
    sourceType,
    notes: null,
    createdAt: `${entryDate}T06:00:00.000Z`,
  };
};

const MOVEMENTS = {
  openings: [],
  movements: [
    leg('m1', 't1', 'cash', 'out', 1500, 'DEPOSIT', monthStart),
    leg('m2', 't1', 'sbi', 'in', 1500, 'DEPOSIT', monthStart),
    leg('m3', 't2', 'sbi', 'out', 700, 'TRANSFER'),
    leg('m4', 't2', 'bob', 'in', 700, 'TRANSFER'),
    leg('m5', 'x', 'sbi', 'out', 500, 'BANK_CHARGE'),
  ],
};

type Answer = { data: unknown } | 'fail';

/** Answers each API path (longest match wins); anything unlisted answers an empty list. */
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
  '/finance/accounts': { data: ACCOUNTS },
  '/finance/accounts/sbi/ledger': { data: LEDGER },
  '/finance/movements': { data: MOVEMENTS },
};

const render = () => renderWithProviders(<AccountsPanel selectedStation={station} />);
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const tileLabels = () => Array.from(document.querySelectorAll('[data-alert], .kpi-value')).length;
const primaryButtons = () =>
  screen.getAllByRole('button').filter((b) => /bg-brand\b/.test(b.getAttribute('class') ?? ''));

beforeEach(() => {
  stubApi(API);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  __resetNavIntentForTests();
});

describe('Accounts › Accounts, a balance list (#530)', () => {
  it('reads tiles (Now), then the list under its header, with one primary button', async () => {
    render();
    const table = await screen.findByRole('table');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Accounts');
    expect(tileLabels()).toBe(3);
    expect(screen.getAllByText('Now')).toHaveLength(3);
    expect(screen.getByTestId('section-header-accounts').textContent).toContain('4 accounts');
    expect(
      within(screen.getByTestId('section-header-accounts')).getByTestId('control-bar'),
    ).toBeTruthy();
    // Total row says what it covers, and leaves Owner (capital) accounts out.
    expect(table.querySelector('tfoot')!.textContent).toContain('Total cash, bank & clearing');
    expect(table.querySelector('tfoot')!.textContent).toContain('₹6,100.00');
  });

  it('the same page actions on every tab: New account (secondary), New transfer (primary)', async () => {
    render();
    await screen.findByRole('table');
    const actions = () =>
      Array.from(document.querySelectorAll('header button')).map((b) => b.textContent);
    for (const tab of ['Accounts', 'Daily cash book', 'Transfers']) {
      fireEvent.click(screen.getByRole('tab', { name: new RegExp(tab) }));
      expect(actions().slice(0, 2), tab).toEqual(['New account', 'New transfer']);
      expect(
        primaryButtons().map((b) => b.textContent),
        tab,
      ).toEqual(['New transfer']);
    }
  });

  it('leaves Owner accounts out of the total, and adds a CMS tile only with a CMS account', async () => {
    stubApi({
      ...API,
      '/finance/accounts': {
        data: [
          ...ACCOUNTS,
          { id: 'own', name: 'Capital', accountType: 'OWNER', balance: '90000' },
          { id: 'cms', name: 'IOCL CMS', accountType: 'CMS', balance: '400' },
        ],
      },
    });
    render();
    const table = await screen.findByRole('table');
    expect(table.querySelector('tfoot')!.textContent).toContain('₹6,500.00');
    expect(tileLabels()).toBe(4);
    expect(screen.getByText('CMS receivable')).toBeTruthy();
  });

  it('shows every account type as a neutral chip; only a negative balance reads red', async () => {
    render();
    const table = await screen.findByRole('table');
    for (const label of ['Cash in Hand', 'Card/UPI Clearing']) {
      const chip = within(table)
        .getAllByText(label)
        .map((el) => el.closest('span[class*="bg-"]'))
        .find(Boolean)!;
      expect(chip.getAttribute('class')).toMatch(/bg-surface-alt/);
    }
    expect(table.innerHTML).not.toMatch(/bg-(warning|success|info)-bg/);
    const red = Array.from(table.querySelectorAll('.text-danger-fg')).map((e) => e.textContent);
    expect(red).toEqual(['−₹200.00']);
    // The bank tile still sums to a positive figure, so no tile alerts.
    expect(document.querySelector('[data-alert]')).toBeNull();
  });

  it('a row opens the statement by click or keyboard; All accounts goes back', async () => {
    render();
    await screen.findByRole('table');
    const row = screen.getByRole('row', { name: 'SBI Current statement' });
    expect(row.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(row, { key: 'Enter' });
    await screen.findByRole('table', { name: 'SBI Current statement' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('SBI Current');
    expect(screen.getByRole('tab', { name: /Accounts/, selected: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /All accounts/ }));
    expect(await screen.findByRole('row', { name: 'SBI Current statement' })).toBeTruthy();
  });

  it("each section has its own Retry when the accounts can't load", async () => {
    stubApi({ ...API, '/finance/accounts': 'fail' });
    render();
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
    for (const alert of screen.getAllByRole('alert')) {
      expect(within(alert).getByRole('button', { name: 'Retry' })).toBeTruthy();
    }
    expect(screen.queryByText('No accounts yet')).toBeNull();
  });

  it('shows the empty state when there are no accounts', async () => {
    stubApi({ ...API, '/finance/accounts': { data: [] } });
    render();
    expect(await screen.findByText('No accounts yet')).toBeTruthy();
  });
});

describe('Accounts › an account statement (#530)', () => {
  it('opens from a deep link, on the Statement module, with fixed tiles above it', async () => {
    act(() => publishNavIntent({ openAccountId: 'sbi' }));
    render();
    const table = await screen.findByRole('table', { name: 'SBI Current statement' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('SBI Current');
    // Its type, as the one chip, under the title.
    expect(screen.getByText('Bank').closest('span[class*="bg-"]')!.getAttribute('class')).toMatch(
      /bg-surface-alt/,
    );
    await waitFor(() => expect(screen.getAllByText(monthName)).toHaveLength(2));
    expect(screen.getByText('Now')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Statement period/ })).toBeTruthy();
    expect(table.querySelector('tfoot')!.textContent).toContain('₹5,000.00');
    // Its own actions sit in the statement's header; the page keeps one primary.
    const header = screen.getByTestId('section-header-statement');
    expect(within(header).getByRole('button', { name: /Add entry/ })).toBeTruthy();
    expect(within(header).queryByRole('button', { name: /Settle to bank/ })).toBeNull();
    expect(primaryButtons().map((b) => b.textContent)).toEqual(['New transfer']);
    expect(document.body.textContent).not.toMatch(ISO_DATE);
  });

  it('picks the deep link up once: leaving and coming back shows the list', async () => {
    act(() => publishNavIntent({ openAccountId: 'sbi' }));
    const first = render();
    await screen.findByRole('table', { name: 'SBI Current statement' });
    await waitFor(() => expect(getNavIntentState().intent).toBeNull());
    // Still on the statement after the intent is cleared.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('SBI Current');
    first.unmount();
    render();
    expect(await screen.findByRole('row', { name: 'SBI Current statement' })).toBeTruthy();
  });

  it('says "Account not found" for an id that matches no account', async () => {
    act(() => publishNavIntent({ openAccountId: 'gone' }));
    render();
    expect(await screen.findByText('Account not found')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /All accounts/ }));
    expect(await screen.findByRole('row', { name: 'SBI Current statement' })).toBeTruthy();
  });

  it('a clearing account adds Settle to bank to the statement header', async () => {
    stubApi({ ...API, '/finance/accounts/pos/ledger': { data: { ...LEDGER, entries: [] } } });
    act(() => publishNavIntent({ openAccountId: 'pos' }));
    render();
    await screen.findByText('Account statement');
    const header = await screen.findByTestId('section-header-statement');
    expect(within(header).getByRole('button', { name: /Settle to bank/ })).toBeTruthy();
    expect(within(header).getByRole('button', { name: /Add entry/ })).toBeTruthy();
  });

  it("the statement's own Retry when its ledger can't load", async () => {
    stubApi({ ...API, '/finance/accounts/sbi/ledger': 'fail' });
    act(() => publishNavIntent({ openAccountId: 'sbi' }));
    render();
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect(screen.getAllByRole('alert')[0].textContent).toMatch(/Couldn.t load account/);
  });
});

describe('Accounts › Transfers (#530)', () => {
  it('pairs both legs into one row, with kind chips filtering at once and a labelled total', async () => {
    act(() => publishNavIntent({ openAccountsTab: 'transfers' }));
    render();
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header, 2 transfers
    // No total for All: the owner rule is a total only when filtered.
    expect(table.querySelector('tfoot')).toBeNull();
    expect(screen.getAllByText(monthName)).toHaveLength(2);
    expect(screen.getByText('Today')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Deposits, 1' }));
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header, 1 deposit, total
    expect(table.querySelector('tfoot')!.textContent).toContain('Total of 1 shown');
    expect(table.querySelector('tfoot')!.textContent).toContain('₹1,500.00');
    expect(document.body.textContent).not.toMatch(ISO_DATE);
  });
});

describe('Accounts › Transfers, odd legs (#572 review)', () => {
  it('names a missing side "Org account" and flags legs that disagree', async () => {
    stubApi({
      ...API,
      '/finance/movements': {
        data: {
          openings: [],
          movements: [
            // Only this station's leg: its partner is an org-shared account.
            leg('o1', 't9', 'sbi', 'out', 900, 'TRANSFER'),
            // Two legs that moved different amounts.
            leg('x1', 't8', 'cash', 'out', 400, 'TRANSFER'),
            { ...leg('x2', 't8', 'bob', 'in', 390, 'TRANSFER') },
          ],
        },
      },
    });
    act(() => publishNavIntent({ openAccountsTab: 'transfers' }));
    render();
    const table = await screen.findByRole('table');
    const lone = within(table).getByText('Org account').closest('tr')!;
    const cells = Array.from(lone.querySelectorAll('td')).map((td) => td.textContent);
    // Entry date · Kind · From · To · Notes · Amount
    expect(cells.slice(2, 4)).toEqual(['SBI Current', 'Org account']);
    const odd = within(table).getByText('Variance').closest('tr')!;
    expect(odd.textContent).toContain('₹400.00');
    expect(within(table).getAllByText('Variance')).toHaveLength(1);
  });
});

describe('Accounts › Daily cash book (#530)', () => {
  it('has no inline styles and no raw dates', async () => {
    stubApi({
      ...API,
      '/finance/cash-book': {
        data: {
          date: today,
          accounts: [
            {
              id: 'cash',
              name: 'Cash in Hand',
              accountType: 'CASH_IN_HAND',
              opening: 100,
              moneyIn: 50,
              moneyOut: 20,
              closing: 130,
              entries: [],
            },
          ],
        },
      },
    });
    act(() => publishNavIntent({ openAccountsTab: 'cash-book' }));
    render();
    const table = await screen.findByRole('table');
    expect(table.querySelector('tfoot')!.textContent).toContain('Cash total');
    // Money that moved is plain; only a problem is coloured.
    expect(table.innerHTML).not.toMatch(/text-(success|danger)-fg/);
    expect(screen.getByTestId('section-header-daily-cash-book').textContent).toContain(
      formatBusinessDate(today),
    );
    expect(document.body.textContent).not.toMatch(ISO_DATE);
  });

  it('no inline styles in the Accounts screens (#563)', () => {
    for (const file of [
      '../reports/DailyCashBook.tsx',
      './AccountsPanel.tsx',
      './AccountsList.tsx',
      './AccountStatement.tsx',
      './TransfersView.tsx',
      './AccountDrawers.tsx',
      './AccountTypeChip.tsx',
    ]) {
      const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      expect(src, file).not.toMatch(/style=\{/);
    }
  });
});

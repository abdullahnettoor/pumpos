/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { publishNavIntent, __resetNavIntentForTests } from '../../nav-intent/store.js';
import { queryKeys } from '../../query/hooks.js';
import { AccountsPanel } from './AccountsPanel.js';

/**
 * The Accounts drawers keep their behaviour through the #530 move (#572
 * review): each sends the same request (path, method, body, no
 * Idempotency-Key, as before), checks the same things before sending, and
 * refreshes the same caches after.
 */

vi.mock('@pump/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pump/shared')>();
  return { ...actual, resolveEntryDate: () => '2026-10-14' };
});

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
} as any;

const ACCOUNTS = [
  {
    id: 'cash',
    name: 'Cash in Hand',
    accountType: 'CASH_IN_HAND',
    balance: '1000',
    openingBalance: '250',
    openingDate: '2026-04-01',
  },
  { id: 'sbi', name: 'SBI Current', accountType: 'BANK', balance: '5000' },
  { id: 'pos', name: 'HDFC POS', accountType: 'MERCHANT_CLEARING', balance: '300' },
];

interface Sent {
  url: string;
  method: string;
  body: any;
  headers: Record<string, string>;
}
let sent: Sent[] = [];

beforeEach(() => {
  sent = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method !== 'GET') {
        sent.push({
          url: url.replace(/^.*\/api/, ''),
          method,
          body: JSON.parse(String(init?.body ?? 'null')),
          headers: (init?.headers ?? {}) as Record<string, string>,
        });
      }
      const data = url.includes('/ledger')
        ? { account: ACCOUNTS[0], periodOpeningBalance: '0', entries: [] }
        : url.includes('/finance/accounts') && method === 'GET'
          ? ACCOUNTS
          : method === 'GET'
            ? []
            : { id: 'new' };
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  __resetNavIntentForTests();
});

const drawer = () => document.querySelector('.drawer-container') as HTMLElement;
/** The control under a Field label (Field does not link its label). */
const field = (label: string) =>
  within(drawer())
    .getByText(label, { selector: 'label' })
    .parentElement!.querySelector('input, select') as HTMLInputElement;
const type = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });
const submit = (name: string) => fireEvent.click(within(drawer()).getByRole('button', { name }));
const alertText = () => within(drawer()).getByRole('alert').textContent;

/** The cache keys a money write refreshes. */
const MONEY_KEYS = [
  queryKeys.financialAccounts('st-1'),
  queryKeys.fundingAccountsAll(),
  ['account-ledger'],
  queryKeys.dailyCashBookPrefix(),
  queryKeys.financeMovementsPrefix(),
];

async function renderPage(intent?: Parameters<typeof publishNavIntent>[0]) {
  if (intent) act(() => publishNavIntent(intent));
  const r = renderWithProviders(<AccountsPanel selectedStation={station} />);
  const spy = vi.spyOn(r.queryClient, 'invalidateQueries');
  await screen.findByRole('table');
  return spy;
}
const invalidated = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);

describe('New account drawer', () => {
  it('asks for a name, then creates with the same payload and refreshes the account lists', async () => {
    const spy = await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /New account/ }));
    submit('Create account');
    expect(alertText()).toBe('Give the account a name.');
    expect(sent).toHaveLength(0);

    type('Name', '  HDFC Current ');
    type('Bank name', 'HDFC Bank');
    type('Account no.', '****9876');
    type('IFSC', 'HDFC0000123');
    type('Opening balance (₹)', '1500');
    type('As of', '2026-10-01');
    submit('Create account');
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      url: '/finance/accounts',
      method: 'POST',
      body: {
        stationId: 'st-1',
        accountType: 'BANK',
        name: 'HDFC Current',
        openingBalance: 1500,
        openingDate: '2026-10-01',
        metadata: { bankName: 'HDFC Bank', accountNoMasked: '****9876', ifsc: 'HDFC0000123' },
      },
    });
    expect(Object.keys(sent[0].headers)).not.toContain('Idempotency-Key');
    await waitFor(() =>
      expect(invalidated(spy)).toEqual([
        queryKeys.financialAccounts('st-1'),
        queryKeys.fundingAccountsAll(),
      ]),
    );
    expect(await screen.findByText('Account created.')).toBeTruthy();
  });

  it('sends no bank details for a non-bank account', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /New account/ }));
    fireEvent.change(field('Type'), { target: { value: 'PETTY_CASH' } });
    type('Name', 'Office petty');
    submit('Create account');
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toEqual({
      stationId: 'st-1',
      accountType: 'PETTY_CASH',
      name: 'Office petty',
      openingBalance: 0,
      openingDate: null,
      metadata: null,
    });
  });
});

describe('Transfer drawer', () => {
  it('defaults to the first two accounts and today, validates, and posts the same transfer', async () => {
    const spy = await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /New transfer/ }));
    expect(field('From').value).toBe('cash');
    expect(field('To').value).toBe('sbi');
    expect(field('Date').value).toBe('2026-10-14');

    submit('Record transfer');
    expect(alertText()).toBe('Enter an amount greater than zero.');
    fireEvent.change(field('To'), { target: { value: 'cash' } });
    submit('Record transfer');
    expect(alertText()).toBe('From and To must be different accounts.');
    fireEvent.change(field('To'), { target: { value: '' } });
    submit('Record transfer');
    expect(alertText()).toBe('Choose both accounts.');
    expect(sent).toHaveLength(0);

    fireEvent.change(field('To'), { target: { value: 'sbi' } });
    type('Amount (₹)', '750');
    submit('Record transfer');
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      url: '/finance/transfers',
      method: 'POST',
      body: {
        fromAccountId: 'cash',
        toAccountId: 'sbi',
        amount: 750,
        date: '2026-10-14',
        notes: null,
      },
    });
    expect(Object.keys(sent[0].headers)).not.toContain('Idempotency-Key');
    await waitFor(() => expect(invalidated(spy)).toEqual(MONEY_KEYS));
  });
});

describe('Settle to bank drawer', () => {
  it('prefills the clearing balance and first bank, validates, and posts the same settlement', async () => {
    const spy = await renderPage({ openAccountId: 'pos' });
    fireEvent.click(await screen.findByRole('button', { name: /Settle to bank/ }));
    expect(field('Settle into (bank)').value).toBe('sbi');
    expect(field('Gross batch (₹)').value).toBe('300');
    expect(field('Date').value).toBe('2026-10-14');

    type('MDR / fee (₹)', '400');
    submit('Record settlement');
    expect(alertText()).toBe('Fee cannot exceed the gross amount.');
    type('Gross batch (₹)', '');
    submit('Record settlement');
    expect(alertText()).toBe('Enter the gross batch amount.');
    fireEvent.change(field('Settle into (bank)'), { target: { value: '' } });
    submit('Record settlement');
    expect(alertText()).toBe('Choose the bank the batch settles into.');
    expect(sent).toHaveLength(0);

    fireEvent.change(field('Settle into (bank)'), { target: { value: 'sbi' } });
    type('Gross batch (₹)', '300');
    type('MDR / fee (₹)', '6');
    expect(within(drawer()).getByText('₹294.00')).toBeTruthy();
    submit('Record settlement');
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      url: '/finance/settlements',
      method: 'POST',
      body: {
        clearingAccountId: 'pos',
        bankAccountId: 'sbi',
        grossAmount: 300,
        feeAmount: 6,
        date: '2026-10-14',
        notes: null,
      },
    });
    await waitFor(() => expect(invalidated(spy)).toEqual(MONEY_KEYS));
  });
});

describe('Add entry drawer', () => {
  it('posts a bank charge with its label as the default note', async () => {
    const spy = await renderPage({ openAccountId: 'cash' });
    fireEvent.click(await screen.findByRole('button', { name: /Add entry/ }));
    submit('Add entry');
    expect(alertText()).toBe('Enter an amount greater than zero.');
    type('Amount (₹)', '59');
    submit('Add entry');
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      url: '/finance/accounts/cash/entry',
      method: 'POST',
      body: {
        direction: 'out',
        amount: 59,
        sourceType: 'BANK_CHARGE',
        date: '2026-10-14',
        notes: 'Bank charge / fee',
      },
    });
    await waitFor(() => expect(invalidated(spy)).toEqual(MONEY_KEYS));
  });

  it.each([
    ['INTEREST_PAID', 'out', 'INTEREST'],
    ['INTEREST_EARNED', 'in', 'INTEREST'],
    ['ADJ_IN', 'in', 'ADJUSTMENT'],
    ['ADJ_OUT', 'out', 'ADJUSTMENT'],
  ])('%s posts direction %s, source %s', async (kind, direction, sourceType) => {
    await renderPage({ openAccountId: 'cash' });
    fireEvent.click(await screen.findByRole('button', { name: /Add entry/ }));
    fireEvent.change(field('Type'), { target: { value: kind } });
    type('Amount (₹)', '10');
    type('Notes', 'Typed note');
    submit('Add entry');
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].body).toMatchObject({ direction, sourceType, amount: 10, notes: 'Typed note' });
  });

  it('Set opening balance prefills the current opening and rewrites it (0 and negative allowed)', async () => {
    await renderPage({ openAccountId: 'cash' });
    fireEvent.click(await screen.findByRole('button', { name: /Add entry/ }));
    fireEvent.change(field('Type'), { target: { value: 'OPENING' } });
    expect(field('Opening balance (₹)').value).toBe('250');
    expect(field('As of').value).toBe('2026-04-01');
    expect(within(drawer()).queryByText('Notes', { selector: 'label' })).toBeNull();
    type('Opening balance (₹)', '-1200');
    submit('Save opening balance');
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      url: '/finance/accounts/cash/opening',
      body: { openingBalance: -1200, openingDate: '2026-04-01' },
    });
  });
});

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
 * review): each sends the same request (path, method, body), checks the same
 * things before sending, and refreshes the same caches after. Each save also
 * carries one Idempotency-Key per logical submit (#574): kept while the
 * outcome is unknown, renewed after a decided answer.
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
/** How the API answers the next writes, in order; a write with none left is saved. */
type Reply = 'drop' | { status: number; code: string; message: string; details?: unknown };
let replies: Reply[] = [];

beforeEach(() => {
  sent = [];
  replies = [];
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
        const reply = replies.shift();
        if (reply === 'drop') throw new TypeError('Failed to fetch');
        if (reply) {
          const { status, ...error } = reply;
          return new Response(JSON.stringify({ success: false, error }), {
            status,
            headers: { 'Content-Type': 'application/json' },
          });
        }
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
const keyOf = (i: number) => sent[i].headers['Idempotency-Key'];
const SAFE_RETRY = "Couldn't save. Check the connection and save again.Saving again sends the same";

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
    expect(keyOf(0)).toBeTruthy();
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
    expect(keyOf(0)).toBeTruthy();
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
    expect(keyOf(0)).toBeTruthy();
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
    expect(keyOf(0)).toBeTruthy();
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
    expect(keyOf(0)).toBeTruthy();
  });
});

describe('Idempotency-Key per logical submit (#574)', () => {
  const openTransfer = async () => {
    fireEvent.click(screen.getByRole('button', { name: /New transfer/ }));
    type('Amount (₹)', '750');
  };

  it('a transfer retried after a dropped response reuses its key and says the retry is safe', async () => {
    await renderPage();
    replies = ['drop'];
    await openTransfer();
    submit('Record transfer');
    await waitFor(() => expect(alertText()).toContain(SAFE_RETRY));
    expect(alertText()).toContain('same transfer, so it cannot be recorded twice.');

    submit('Record transfer');
    await screen.findByText('Transfer recorded.');
    expect(sent).toHaveLength(2);
    expect(keyOf(1)).toBe(keyOf(0));

    // Saved: the next transfer is a new logical submit with a new key.
    await openTransfer();
    submit('Record transfer');
    await waitFor(() => expect(sent).toHaveLength(3));
    expect(keyOf(2)).not.toBe(keyOf(0));
  });

  it('keeps the key after a 5xx and an in-progress answer', async () => {
    await renderPage({ openAccountId: 'pos' });
    replies = [
      { status: 503, code: 'INTERNAL', message: 'Service unavailable' },
      {
        status: 409,
        code: 'CONFLICT',
        message: 'A request with this Idempotency-Key is already in progress',
        details: { reason: 'IDEMPOTENCY_IN_PROGRESS' },
      },
    ];
    fireEvent.click(await screen.findByRole('button', { name: /Settle to bank/ }));
    submit('Record settlement');
    await waitFor(() => expect(alertText()).toContain(SAFE_RETRY));
    submit('Record settlement');
    await waitFor(() => expect(sent).toHaveLength(2));
    await waitFor(() => expect(alertText()).toContain(SAFE_RETRY));
    submit('Record settlement');
    await screen.findByText('Settlement recorded.');
    expect(new Set(sent.map((r) => r.headers['Idempotency-Key'])).size).toBe(1);
  });

  it('renews the key after a decided refusal', async () => {
    await renderPage({ openAccountId: 'cash' });
    replies = [{ status: 400, code: 'VALIDATION_ERROR', message: 'Account is archived.' }];
    fireEvent.click(await screen.findByRole('button', { name: /Add entry/ }));
    type('Amount (₹)', '59');
    submit('Add entry');
    await waitFor(() => expect(alertText()).toBe('Account is archived.'));
    submit('Add entry');
    await screen.findByText('Entry recorded.');
    expect(keyOf(1)).toBeTruthy();
    expect(keyOf(1)).not.toBe(keyOf(0));
  });

  it('an edited retry the API refuses keeps the key and warns the first save may be recorded', async () => {
    await renderPage();
    replies = [
      'drop',
      {
        status: 409,
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'This Idempotency-Key was already used with different request content',
      },
    ];
    await openTransfer();
    submit('Record transfer');
    await waitFor(() => expect(alertText()).toContain(SAFE_RETRY));
    type('Amount (₹)', '800');
    submit('Record transfer');
    await waitFor(() => expect(alertText()).toContain("Couldn't save the edited transfer."));
    expect(alertText()).toContain('Your earlier save may already be recorded.');
    expect(keyOf(1)).toBe(keyOf(0));
    type('Amount (₹)', '750');
    submit('Record transfer');
    await screen.findByText('Transfer recorded.');
    expect(keyOf(2)).toBe(keyOf(0));
  });

  it('closing after a drop and entering the same account again reuses the key', async () => {
    await renderPage();
    replies = ['drop'];
    fireEvent.click(screen.getByRole('button', { name: /New account/ }));
    type('Name', 'Office petty');
    submit('Create account');
    await waitFor(() =>
      expect(alertText()).toContain('same account, so it cannot be recorded twice.'),
    );
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: /New account/ }));
    type('Name', 'Office petty');
    submit('Create account');
    await screen.findByText('Account created.');
    expect(keyOf(1)).toBe(keyOf(0));
  });

  it('an entry and an opening balance on the same drawer never share a key', async () => {
    await renderPage({ openAccountId: 'cash' });
    replies = ['drop'];
    fireEvent.click(await screen.findByRole('button', { name: /Add entry/ }));
    type('Amount (₹)', '59');
    submit('Add entry');
    await waitFor(() =>
      expect(alertText()).toContain('same entry, so it cannot be recorded twice.'),
    );
    fireEvent.change(field('Type'), { target: { value: 'OPENING' } });
    submit('Save opening balance');
    await screen.findByText('Opening balance updated.');
    expect(sent[1].url).toBe('/finance/accounts/cash/opening');
    expect(keyOf(1)).toBeTruthy();
    expect(keyOf(1)).not.toBe(keyOf(0));

    // The dropped entry's key is still held: entering it again reuses it.
    fireEvent.click(await screen.findByRole('button', { name: /Add entry/ }));
    type('Amount (₹)', '59');
    submit('Add entry');
    await screen.findByText('Entry recorded.');
    expect(keyOf(2)).toBe(keyOf(0));
  });
});

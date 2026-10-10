// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AccessMode, Role } from '@pump/shared';

/**
 * Recording a Collection from the Customer page. Real TanStack Query and real
 * hooks; only the cloud services' network methods are stubbed.
 */
const ui = await import('@pump/ui');
const { CustomerPage } = await import('./CustomerPage.js');
const { ShellContext } = await import('../../shell/context.js');
const { NavProvider } = await import('../../shell/nav.js');

const KTC = {
  id: 'c1',
  name: 'KTC Logistics',
  customerType: 'Fleet',
  creditLimit: '200000',
  currentBalance: '150000.00',
};

const ACCOUNTS = [
  { id: 'cash', name: 'Cash in Hand', accountType: 'CASH_IN_HAND', stationId: 'st-1' },
  { id: 'sbi', name: 'SBI Current', accountType: 'BANK', stationId: null },
  { id: 'hdfc', name: 'HDFC Current', accountType: 'BANK', stationId: null },
  { id: 'mc', name: 'Merchant Clearing', accountType: 'MERCHANT_CLEARING', stationId: 'st-1' },
  { id: 'cms', name: 'OMC CMS', accountType: 'CMS', stationId: null },
];

let list: any[];
let accounts: any[];
let accessMode: AccessMode | undefined;
const record = vi.spyOn(ui.CloudTransactionService.prototype, 'recordCollection');
const getCustomers = vi.spyOn(ui.CloudTransactionService.prototype, 'getCustomers');
const getLedger = vi.spyOn(ui.CloudTransactionService.prototype, 'getCustomerLedger');

const refusal = (code: string, message: string, status = 403) =>
  Object.assign(new Error(message), { code, status });

const station = (timezone = 'Asia/Kolkata') =>
  ({ id: 'st-1', name: 'Main', settings: { timezone } }) as any;

const mount = (opts: { role?: Role; station?: any; customer?: any } = {}) => {
  const qc = ui.createQueryClient();
  const view = render(
    <QueryClientProvider client={qc}>
      <ui.ToastProvider>
        <ShellContext.Provider
          value={{
            station: 'station' in opts ? opts.station : station(),
            stationName: 'Main',
            userName: 'Asha',
            role: opts.role ?? 'Owner',
            openAccount: () => {},
          }}
        >
          <NavProvider tabs={['money']}>
            <CustomerPage customer={opts.customer ?? KTC} />
          </NavProvider>
        </ShellContext.Provider>
      </ui.ToastProvider>
    </QueryClientProvider>,
  );
  return { qc, ...view };
};

const balance = () => screen.getByRole('region', { name: 'Balance' });
const payButton = () => within(balance()).queryByRole('button', { name: 'Record payment' });
const openSheet = async () => {
  fireEvent.click(payButton()!);
  return screen.findByRole('dialog', { name: 'Record payment' });
};
const amount = () => screen.getByLabelText('Amount received (₹)') as HTMLInputElement;
const account = () => screen.getByLabelText('Received into') as HTMLSelectElement;
const dateField = () => screen.getByLabelText('Entry date') as HTMLInputElement;
const typeAmount = (v: string) => fireEvent.change(amount(), { target: { value: v } });
const method = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));
const submit = () =>
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: /Record payment|Recording/ }),
  );
const optionLabels = () =>
  Array.from(account().options)
    .map((o) => o.textContent)
    .filter((t) => !t!.startsWith('Choose'));
const pickCash = async (value = '5000') => {
  await openSheet();
  await waitFor(() => expect(account().value).toBe('cash'));
  typeAmount(value);
};

beforeEach(() => {
  list = [{ ...KTC }];
  accounts = ACCOUNTS;
  accessMode = 'NORMAL';
  getCustomers.mockImplementation(async () => list);
  getLedger.mockResolvedValue([]);
  vi.spyOn(ui.CloudFinanceService.prototype, 'getFundingAccounts').mockImplementation(
    async () => accounts,
  );
  vi.spyOn(ui.CloudAccessService.prototype, 'getAccess').mockImplementation(
    async () => ({ subscription: { mode: accessMode } }) as any,
  );
  record.mockReset();
  record.mockImplementation(async (payload) => {
    list = [{ ...list[0], currentBalance: (150000 - Number(payload.amount)).toFixed(2) }];
    return { id: 'col-1', ...payload };
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('who sees the action', () => {
  it.each(['Owner', 'Manager', 'Accountant', 'Staff'] as const)('%s sees it', async (role) => {
    mount({ role });
    await screen.findByRole('region', { name: 'Balance' });
    expect(payButton()).toBeTruthy();
  });

  it('the Attendant does not (the server guard refuses them)', async () => {
    mount({ role: 'Attendant' });
    await screen.findByRole('region', { name: 'Balance' });
    expect(payButton()).toBeNull();
  });

  it('is not offered without a station: an Office Record belongs to one', async () => {
    mount({ station: null });
    await screen.findByRole('region', { name: 'Balance' });
    expect(payButton()).toBeNull();
  });

  it('is a quiet outline inside the balance card, not the highlighted action', async () => {
    mount();
    await screen.findByRole('region', { name: 'Balance' });
    const button = payButton()!;
    expect(balance().contains(button)).toBe(true);
    expect(button.className).toContain('border');
    expect(button.className).not.toMatch(/bg-accent|text-on-accent/);
    // The page has no action bar: Share / Download belong to #400.
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('stays available under Restricted Access: a collection finishes work already done', async () => {
    accessMode = 'RESTRICTED';
    mount();
    // The credit-limit edit is BLOCKED under Restricted Access, so it greys out once the
    // Access Document has loaded; recording a payment does not.
    await waitFor(() =>
      expect(
        within(balance()).getByRole('button', { name: 'Edit limit' }).getAttribute('aria-disabled'),
      ).toBe('true'),
    );
    expect(payButton()!.getAttribute('aria-disabled')).toBeNull();
  });

  it('is disabled with the reason while the organization is suspended', async () => {
    accessMode = 'SUSPENDED';
    mount();
    await waitFor(() => expect(payButton()?.getAttribute('aria-disabled')).toBe('true'));
    const reason = within(balance()).getByText(/Payments cannot be recorded/);
    // Focusable (not `disabled`) and described by the reason, so a screen reader hears why.
    expect((payButton() as HTMLButtonElement).disabled).toBe(false);
    expect(payButton()!.getAttribute('aria-describedby')).toBe(reason.id);
    payButton()!.focus();
    expect(document.activeElement).toBe(payButton());
    fireEvent.click(payButton()!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the sheet', () => {
  it('defaults the Entry Date to the station-timezone civil date, not a Day Start rollback', async () => {
    // 03:30 on the 10th in India, 22:00 UTC on the 9th.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-09T22:00:00Z') });
    mount({ station: station('Asia/Kolkata') });
    await screen.findByRole('region', { name: 'Balance' });
    await openSheet();
    expect(dateField().value).toBe('2026-10-10');
    expect(dateField().max).toBe('2026-10-10');
    cleanup();

    mount({ station: station('UTC') });
    await screen.findByRole('region', { name: 'Balance' });
    await openSheet();
    expect(dateField().value).toBe('2026-10-09');
  });

  it('offers the accounts that suit the method and preselects the only match', async () => {
    mount();
    await openSheet();
    await waitFor(() => expect(optionLabels()).toEqual(['Cash in Hand · Cash in Hand']));
    expect(account().value).toBe('cash');

    method('Bank');
    await waitFor(() => expect(optionLabels()).toHaveLength(2));
    expect(account().value).toBe('');

    method('UPI');
    await waitFor(() => expect(optionLabels()).toHaveLength(3));
    expect(optionLabels().join('|')).not.toMatch(/CMS|Cash in Hand/);
  });

  it('says so when no account takes the method', async () => {
    accounts = [ACCOUNTS[0]];
    mount();
    await openSheet();
    method('Card');
    expect(await screen.findByText(/No account takes this method/)).toBeTruthy();
    expect(account().disabled).toBe(true);
  });

  it('previews what is left to collect', async () => {
    mount();
    await openSheet();
    expect(screen.getByText('₹1,50,000.00 is owed now.')).toBeTruthy();
    typeAmount('50000');
    expect(screen.getByText('₹1,00,000.00 still to collect after this.')).toBeTruthy();
    typeAmount('150000');
    expect(screen.getByText('Settles the account: nothing left to pay.')).toBeTruthy();
    typeAmount('160000');
    expect(screen.getByText('₹10,000.00 paid ahead after this.')).toBeTruthy();
  });

  it('rejects bad entries inline without calling the API', async () => {
    mount();
    await openSheet();
    await waitFor(() => expect(account().value).toBe('cash'));

    submit();
    expect(await screen.findByText('Enter the amount received.')).toBeTruthy();
    expect(amount().getAttribute('aria-invalid')).toBe('true');

    typeAmount('12.345');
    submit();
    expect(await screen.findByText('Use at most 2 decimal places.')).toBeTruthy();

    typeAmount('100');
    fireEvent.change(dateField(), { target: { value: '2099-01-01' } });
    submit();
    expect(await screen.findByText('The date cannot be in the future.')).toBeTruthy();

    // Two bank accounts: nothing is preselected, so the account must be chosen.
    method('Bank');
    await waitFor(() => expect(optionLabels()).toHaveLength(2));
    fireEvent.change(dateField(), { target: { value: '2026-01-01' } });
    submit();
    expect(await screen.findByText('Choose the account')).toBeTruthy();
    expect(record).not.toHaveBeenCalled();
  });

  it('closes on Cancel and on Escape without saving', async () => {
    mount();
    await openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const again = await openSheet();
    fireEvent.keyDown(again, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(record).not.toHaveBeenCalled();
  });
});

describe('saving', () => {
  it('records an Office Record with an Idempotency-Key, then the balance and caches refresh', async () => {
    const { qc } = mount();
    await waitFor(() => expect(balance().getAttribute('data-state')).toBe('under'));
    // Things that read the same collections: the receivables summary and the statement.
    qc.setQueryData(['receivables', 'st-1'], { stale: true });
    qc.setQueryData(['customer-statement', 'c1', '2026-04-01', '9999-12-31'], { stale: true });
    const ledgerCalls = getLedger.mock.calls.length;

    await pickCash('50000');
    fireEvent.change(dateField(), { target: { value: '2026-09-30' } });
    fireEvent.change(screen.getByLabelText('Reference (optional)'), {
      target: { value: '  Cash, bill 4471  ' },
    });
    submit();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(record).toHaveBeenCalledTimes(1);
    const [payload, opts] = record.mock.calls[0];
    expect(payload).toEqual({
      stationId: 'st-1',
      entryDate: '2026-09-30',
      fundingAccountId: 'cash',
      terminalId: undefined,
      customerId: 'c1',
      amount: 50000,
      paymentMethod: 'Cash',
      notes: 'Cash, bill 4471',
    });
    expect(payload).not.toHaveProperty('shiftId');
    expect(opts?.idempotencyKey).toBeTruthy();

    // 1,00,000 owed now: the card repaints at once, and the server's row is fetched again.
    await waitFor(() => expect(within(balance()).getByText('₹1,00,000.00')).toBeTruthy());
    expect(screen.getByText('₹50,000.00 recorded from KTC Logistics.')).toBeTruthy();
    await waitFor(() => expect(getCustomers.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(getLedger.mock.calls.length).toBeGreaterThan(ledgerCalls));
    expect(qc.getQueryState(['receivables', 'st-1'])?.isInvalidated).toBe(true);
    expect(
      qc.getQueryState(['customer-statement', 'c1', '2026-04-01', '9999-12-31'])?.isInvalidated,
    ).toBe(true);
  });

  it('sends the chosen method and account (UPI into a bank account)', async () => {
    mount();
    await openSheet();
    method('UPI');
    await waitFor(() => expect(optionLabels()).toHaveLength(3));
    fireEvent.change(account(), { target: { value: 'sbi' } });
    typeAmount('1200.50');
    submit();
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record.mock.calls[0][0]).toMatchObject({
      paymentMethod: 'UPI',
      fundingAccountId: 'sbi',
      amount: 1200.5,
    });
  });

  it('a double submit records once', async () => {
    let release!: (v: unknown) => void;
    record.mockReset();
    record.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    mount();
    await pickCash();
    submit();
    submit();
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect((screen.getByRole('button', { name: 'Recording…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    release({ id: 'col-1' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('reuses the key after a dropped connection, even when the sheet was closed, and takes a fresh one after a refusal', async () => {
    record.mockReset();
    record.mockRejectedValueOnce(Object.assign(new Error('Network error'), { code: 'NETWORK' }));
    mount();
    await pickCash();
    submit();
    expect((await screen.findByRole('alert')).textContent).toBe('Network error');

    // Close and reopen: the outcome is still unknown, so the same entries keep the same key.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await openSheet();
    await waitFor(() => expect(account().value).toBe('cash'));
    typeAmount('5000');
    record.mockRejectedValueOnce(
      refusal('VALIDATION_ERROR', 'Account "Cash in Hand" is inactive', 400),
    );
    submit();
    await screen.findByText('Account "Cash in Hand" is inactive');

    // A decided refusal is cached under its key by the API: the next try needs a new one.
    record.mockResolvedValueOnce({ id: 'col-2' });
    submit();
    await waitFor(() => expect(record).toHaveBeenCalledTimes(3));
    const keys = record.mock.calls.map((c) => c[1]?.idempotencyKey);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('shows an access refusal inline, keeps the sheet and greys the action out', async () => {
    record.mockRejectedValue(
      refusal('ORGANIZATION_SUSPENDED', 'This Organization is suspended. Contact PumpOS.'),
    );
    mount();
    await pickCash();
    // The server now reports the suspension; the refusal makes the client re-read it.
    accessMode = 'SUSPENDED';
    submit();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('This Organization is suspended. Contact PumpOS.');
    expect(screen.getByRole('dialog', { name: 'Record payment' })).toBeTruthy();
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Record payment', hidden: true, description: /suspended/i })
          .getAttribute('aria-disabled'),
      ).toBe('true'),
    );
  });

  it('answers a permission refusal on the sheet', async () => {
    record.mockRejectedValue(
      refusal('FORBIDDEN', 'Insufficient permissions to record collections'),
    );
    mount();
    await pickCash();
    submit();
    expect((await screen.findByRole('alert')).textContent).toMatch(/permission/i);
  });
});

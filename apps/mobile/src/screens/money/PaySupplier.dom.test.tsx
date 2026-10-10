// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AccessMode, Role } from '@pump/shared';

/**
 * Recording a Supplier Payment from the Supplier page. Real TanStack Query and
 * real hooks; only the cloud services' network methods are stubbed.
 */
const ui = await import('@pump/ui');
const { SupplierPage } = await import('./SupplierPage.js');
const { ShellContext } = await import('../../shell/context.js');
const { NavProvider } = await import('../../shell/nav.js');

const BPCL = {
  id: 's1',
  name: 'Bharat Petroleum',
  currentBalance: '1043200.00',
  metadata: { gstin: '32AAACB1234F1Z5' },
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
const record = vi.spyOn(ui.CloudTransactionService.prototype, 'recordSupplierPayment');
const getSuppliers = vi.spyOn(ui.CloudTransactionService.prototype, 'getSuppliers');
const getLedger = vi.spyOn(ui.CloudTransactionService.prototype, 'getSupplierLedger');

const refusal = (code: string, message: string, status = 403) =>
  Object.assign(new Error(message), { code, status });

const station = (timezone = 'Asia/Kolkata') =>
  ({ id: 'st-1', name: 'Main', settings: { timezone } }) as any;

const mount = (opts: { role?: Role; station?: any; supplier?: any } = {}) => {
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
            <SupplierPage supplier={opts.supplier ?? BPCL} />
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
  return screen.findByRole('dialog', { name: 'Record supplier payment' });
};
const amount = () => screen.getByLabelText('Amount paid (₹)') as HTMLInputElement;
const account = () => screen.getByLabelText('Paid from') as HTMLSelectElement;
const dateField = () => screen.getByLabelText('Entry date') as HTMLInputElement;
const typeAmount = (v: string) => fireEvent.change(amount(), { target: { value: v } });
const submit = () =>
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: /Record payment|Recording/ }),
  );
const optionLabels = () =>
  Array.from(account().options)
    .map((o) => o.textContent)
    .filter((t) => !t!.startsWith('Choose'));
/** Fills the sheet with a payment from the bank account SBI. */
const fillBank = async (value = '25000') => {
  await openSheet();
  await waitFor(() => expect(optionLabels().length).toBeGreaterThan(1));
  fireEvent.change(account(), { target: { value: 'sbi' } });
  typeAmount(value);
};

beforeEach(() => {
  list = [{ ...BPCL }];
  accounts = ACCOUNTS;
  accessMode = 'NORMAL';
  getSuppliers.mockImplementation(async () => list);
  getLedger.mockResolvedValue([]);
  vi.spyOn(ui.CloudFinanceService.prototype, 'getFundingAccounts').mockImplementation(
    async () => accounts,
  );
  vi.spyOn(ui.CloudAccessService.prototype, 'getAccess').mockImplementation(
    async () => ({ subscription: { mode: accessMode } }) as any,
  );
  record.mockReset();
  record.mockImplementation(async (payload) => {
    list = [{ ...list[0], currentBalance: (1043200 - Number(payload.amount)).toFixed(2) }];
    return { id: 'pay-1', ...payload };
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('who sees the action', () => {
  it.each(['Owner', 'Manager', 'Accountant'] as const)('%s sees it', async (role) => {
    mount({ role });
    await screen.findByRole('region', { name: 'Balance' });
    expect(payButton()).toBeTruthy();
  });

  it.each(['Staff', 'Attendant'] as const)(
    '%s does not (the server guard refuses them)',
    async (role) => {
      mount({ role });
      await screen.findByRole('region', { name: 'Balance' });
      expect(payButton()).toBeNull();
    },
  );

  it('is not offered without a station: an Office Record belongs to one', async () => {
    mount({ station: null });
    await screen.findByRole('region', { name: 'Balance' });
    expect(payButton()).toBeNull();
  });

  it('is a quiet outline inside the balance card, not in an action bar', async () => {
    mount();
    await screen.findByRole('region', { name: 'Balance' });
    const button = payButton()!;
    expect(balance().contains(button)).toBe(true);
    expect(button.className).toContain('border');
    expect(button.className).not.toMatch(/bg-accent|text-on-accent/);
    // The page has no action bar: Share / Download belong to #400.
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('stays available under Restricted Access: a payment already made must be recorded', async () => {
    accessMode = 'RESTRICTED';
    mount();
    await screen.findByRole('region', { name: 'Balance' });
    // Let the Access Document load before judging the button.
    await waitFor(() => expect(ui.CloudAccessService.prototype.getAccess).toHaveBeenCalled());
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

  it('offers the accounts a supplier can be paid from (cash, bank, owner, CMS), and no method', async () => {
    mount();
    await openSheet();
    await waitFor(() => expect(optionLabels()).toHaveLength(4));
    expect(optionLabels().join('|')).not.toMatch(/Merchant Clearing/);
    expect(optionLabels().join('|')).toMatch(/Cash in Hand/);
    expect(optionLabels().join('|')).toMatch(/OMC CMS/);
    // Four to choose from: nothing is preselected.
    expect(account().value).toBe('');
    // A supplier payment has no payment-method field; the account is the method.
    expect(screen.queryByRole('group', { name: 'Method' })).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('preselects the only account that can pay', async () => {
    accounts = [ACCOUNTS[0], ACCOUNTS[3]];
    mount();
    await openSheet();
    await waitFor(() => expect(account().value).toBe('cash'));
  });

  it('says so when no account can pay', async () => {
    accounts = [ACCOUNTS[3]];
    mount();
    await openSheet();
    expect(await screen.findByText(/No account can pay this/)).toBeTruthy();
    expect(account().disabled).toBe(true);
  });

  it('previews what is still owed', async () => {
    mount();
    await openSheet();
    expect(screen.getByText('₹10,43,200.00 is owed now.')).toBeTruthy();
    typeAmount('43200');
    expect(screen.getByText('₹10,00,000.00 still owed after this.')).toBeTruthy();
    typeAmount('1043200');
    expect(screen.getByText('Settles the account: nothing left to pay.')).toBeTruthy();
    typeAmount('1050000');
    expect(screen.getByText('₹6,800.00 paid ahead after this.')).toBeTruthy();
  });

  it('shows an advance as paid ahead, and a second payment adds to it', async () => {
    mount({ supplier: { ...BPCL, currentBalance: '-49000.00' } });
    await openSheet();
    expect(screen.getByText('₹49,000.00 is already paid ahead.')).toBeTruthy();
    typeAmount('1000');
    expect(screen.getByText('₹50,000.00 paid ahead after this.')).toBeTruthy();
  });

  it('rejects bad entries inline without calling the API', async () => {
    mount();
    await openSheet();
    await waitFor(() => expect(optionLabels()).toHaveLength(4));

    submit();
    expect(await screen.findByText('Amount is required')).toBeTruthy();
    expect(amount().getAttribute('aria-invalid')).toBe('true');
    expect(await screen.findByText('Choose the account')).toBeTruthy();

    typeAmount('12.345');
    submit();
    expect(await screen.findByText('Use at most 2 decimal places.')).toBeTruthy();

    typeAmount('100');
    fireEvent.change(dateField(), { target: { value: '2099-01-01' } });
    submit();
    expect(await screen.findByText('The date cannot be in the future.')).toBeTruthy();
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
  it('records an Office Record with an Idempotency-Key, then the balance, statement and caches refresh', async () => {
    mount();
    await waitFor(() => expect(balance().getAttribute('data-state')).toBe('owes'));
    const ledgerCalls = getLedger.mock.calls.length;

    await fillBank('43200');
    fireEvent.change(dateField(), { target: { value: '2026-09-30' } });
    fireEvent.change(screen.getByLabelText('Reference (optional)'), {
      target: { value: '  NEFT 4471  ' },
    });
    submit();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(record).toHaveBeenCalledTimes(1);
    const [payload, opts] = record.mock.calls[0];
    expect(payload).toEqual({
      stationId: 'st-1',
      entryDate: '2026-09-30',
      fundingAccountId: 'sbi',
      supplierId: 's1',
      amount: 43200,
      notes: 'NEFT 4471',
    });
    expect(payload).not.toHaveProperty('shiftId');
    expect(opts?.idempotencyKey).toBeTruthy();

    // 10,00,000 owed now: the card repaints at once, and the server's row is fetched again.
    await waitFor(() => expect(within(balance()).getByText('₹10,00,000.00')).toBeTruthy());
    expect(screen.getByText('₹43,200.00 paid to Bharat Petroleum.')).toBeTruthy();
    await waitFor(() => expect(getSuppliers.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(getLedger.mock.calls.length).toBeGreaterThan(ledgerCalls));
  });

  it('paying more than is owed leaves an advance', async () => {
    mount();
    await waitFor(() => expect(balance().getAttribute('data-state')).toBe('owes'));
    await fillBank('1050000');
    submit();
    await waitFor(() => expect(balance().getAttribute('data-state')).toBe('advance'));
    expect(within(balance()).getByText('₹6,800.00')).toBeTruthy();
  });

  it('a double submit records once', async () => {
    let release!: (v: unknown) => void;
    record.mockReset();
    record.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    mount();
    await fillBank();
    submit();
    submit();
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect((screen.getByRole('button', { name: 'Recording…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    release({ id: 'pay-1' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('reuses the key after a dropped connection, even when the sheet was closed, and takes a fresh one after a refusal', async () => {
    record.mockReset();
    record.mockRejectedValueOnce(Object.assign(new Error('Network error'), { code: 'NETWORK' }));
    mount();
    await fillBank();
    submit();
    expect((await screen.findByRole('alert')).textContent).toBe('Network error');

    // Close and reopen: the outcome is still unknown, so the same entries keep the same key.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await fillBank();
    record.mockRejectedValueOnce(
      refusal('VALIDATION_ERROR', 'Account "SBI Current" is inactive', 400),
    );
    submit();
    await screen.findByText('Account "SBI Current" is inactive');

    // A decided refusal is cached under its key by the API: the next try needs a new one.
    record.mockResolvedValueOnce({ id: 'pay-2' });
    submit();
    await waitFor(() => expect(record).toHaveBeenCalledTimes(3));
    const keys = record.mock.calls.map((c) => c[1]?.idempotencyKey);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('keeps the key through an edit after an unknown outcome and warns the first attempt may have gone through', async () => {
    record.mockReset();
    record.mockRejectedValueOnce(Object.assign(new Error('Network error'), { code: 'NETWORK' }));
    mount();
    await fillBank('25000');
    submit();
    await screen.findByText('Network error');
    // Same entries: a plain retry, nothing to warn about.
    expect(screen.queryByText(/may have gone through/)).toBeNull();

    // The user changes the amount and tries again: still the same key.
    typeAmount('24000');
    expect((await screen.findByRole('status')).textContent).toMatch(
      /earlier attempt of ₹25,000\.00 may have gone through/,
    );
    record.mockResolvedValueOnce({ id: 'pay-2' });
    submit();
    await waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    const keys = record.mock.calls.map((c) => c[1]?.idempotencyKey);
    expect(keys[1]).toBe(keys[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('when the API says the earlier attempt arrived, the balance is re-read and the next try takes a new key', async () => {
    record.mockReset();
    record.mockRejectedValueOnce(Object.assign(new Error('Network error'), { code: 'NETWORK' }));
    mount();
    await fillBank('25000');
    submit();
    await screen.findByText('Network error');
    const loads = getSuppliers.mock.calls.length;
    const ledgerLoads = getLedger.mock.calls.length;

    typeAmount('24000');
    record.mockRejectedValueOnce(
      refusal(
        'CONFLICT',
        'This Idempotency-Key was already used with different request content',
        409,
      ),
    );
    submit();
    expect((await screen.findByRole('alert')).textContent).toMatch(/earlier attempt was received/i);
    await waitFor(() => expect(getSuppliers.mock.calls.length).toBeGreaterThan(loads));
    await waitFor(() => expect(getLedger.mock.calls.length).toBeGreaterThan(ledgerLoads));
    expect(screen.queryByText(/may have gone through/)).toBeNull();

    record.mockResolvedValueOnce({ id: 'pay-3' });
    submit();
    await waitFor(() => expect(record).toHaveBeenCalledTimes(3));
    const keys = record.mock.calls.map((c) => c[1]?.idempotencyKey);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('keeps the account Retry outside its description', async () => {
    vi.spyOn(ui.CloudFinanceService.prototype, 'getFundingAccounts').mockRejectedValue(
      new Error('boom'),
    );
    mount();
    await openSheet();
    const retry = await screen.findByRole('button', { name: 'Retry' }, { timeout: 4000 });
    const hint = document.getElementById(account().getAttribute('aria-describedby')!)!;
    expect(hint.textContent).toBe('Could not load accounts.');
    expect(hint.contains(retry)).toBe(false);
  });

  it('shows an access refusal inline, keeps the sheet and greys the action out', async () => {
    record.mockRejectedValue(
      refusal('ORGANIZATION_SUSPENDED', 'This Organization is suspended. Contact PumpOS.'),
    );
    mount();
    await fillBank();
    // The server now reports the suspension; the refusal makes the client re-read it.
    accessMode = 'SUSPENDED';
    submit();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('This Organization is suspended. Contact PumpOS.');
    expect(screen.getByRole('dialog', { name: 'Record supplier payment' })).toBeTruthy();
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
      refusal('FORBIDDEN', 'Insufficient permissions to record supplier payments'),
    );
    mount();
    await fillBank();
    submit();
    expect((await screen.findByRole('alert')).textContent).toMatch(/permission/i);
  });
});

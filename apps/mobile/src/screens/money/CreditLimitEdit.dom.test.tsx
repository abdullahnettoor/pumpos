// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AccessMode, Role } from '@pump/shared';

/**
 * Editing a Customer's credit limit from the Customer page. Real TanStack Query
 * and real hooks; only the cloud services' network methods are stubbed.
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
  currentBalance: '150000',
};

let list: any[];
let accessMode: AccessMode | undefined;
const update = vi.spyOn(ui.CloudTransactionService.prototype, 'updateCustomer');

const refusal = (code: string, message: string, status = 403) =>
  Object.assign(new Error(message), { code, status });

const mount = (role: Role = 'Owner', customer: any = KTC) => {
  const qc = ui.createQueryClient();
  const view = render(
    <QueryClientProvider client={qc}>
      <ui.ToastProvider>
        <ShellContext.Provider
          value={{ station: null, stationName: 'S', userName: 'Asha', role, openAccount: () => {} }}
        >
          <NavProvider tabs={['money']}>
            <CustomerPage customer={customer} />
          </NavProvider>
        </ShellContext.Provider>
      </ui.ToastProvider>
    </QueryClientProvider>,
  );
  return { qc, ...view };
};

const balance = () => screen.getByRole('region', { name: 'Balance' });
const editButton = () => screen.queryByRole('button', { name: /Edit limit|Set limit/ });
const openSheet = async () => {
  fireEvent.click(editButton()!);
  return screen.findByRole('dialog', { name: 'Edit credit limit' });
};
const field = () => screen.getByLabelText('New limit (₹)') as HTMLInputElement;
const type = (v: string) => fireEvent.change(field(), { target: { value: v } });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save limit' }));

beforeEach(() => {
  list = [{ ...KTC }];
  accessMode = 'NORMAL';
  vi.spyOn(ui.CloudTransactionService.prototype, 'getCustomers').mockImplementation(
    async () => list,
  );
  vi.spyOn(ui.CloudTransactionService.prototype, 'getCustomerLedger').mockResolvedValue([]);
  vi.spyOn(ui.CloudAccessService.prototype, 'getAccess').mockImplementation(
    async () => ({ subscription: { mode: accessMode } }) as any,
  );
  update.mockReset();
  update.mockImplementation(async (_id, payload) => {
    list = [
      { ...list[0], creditLimit: payload.creditLimit == null ? null : String(payload.creditLimit) },
    ];
    return list[0];
  });
});
afterEach(() => {
  cleanup();
});

describe('who sees the edit action', () => {
  it.each(['Owner', 'Manager'] as const)('%s sees it', async (role) => {
    mount(role);
    expect(await screen.findByRole('button', { name: 'Edit limit' })).toBeTruthy();
  });

  it.each(['Accountant', 'Staff', 'Attendant'] as const)('%s does not', async (role) => {
    mount(role);
    await screen.findByRole('region', { name: 'Balance' });
    expect(editButton()).toBeNull();
  });

  it('is not offered for a Regular customer', async () => {
    mount('Owner', { ...KTC, customerType: 'Regular' });
    await screen.findByRole('region', { name: 'Balance' });
    expect(editButton()).toBeNull();
  });

  it('reads "Set limit" when there is no limit yet', async () => {
    list = [{ ...KTC, creditLimit: null }];
    mount('Owner', list[0]);
    expect(await screen.findByRole('button', { name: 'Set limit' })).toBeTruthy();
  });

  it.each(['RESTRICTED', 'SUSPENDED'] as const)(
    'is disabled with the reason while access is %s',
    async (mode) => {
      accessMode = mode;
      mount();
      await waitFor(() => expect((editButton() as HTMLButtonElement).disabled).toBe(true));
      expect(within(balance()).getByText(/paused|restricted/i)).toBeTruthy();
      fireEvent.click(editButton()!);
      expect(screen.queryByRole('dialog')).toBeNull();
    },
  );
});

describe('the edit sheet', () => {
  it('starts from the current limit and previews the new one', async () => {
    mount();
    await openSheet();
    expect(field().value).toBe('200000');
    expect(screen.getByText('₹2,00,000.00', { selector: 'span' })).toBeTruthy();
    type('100000');
    expect(screen.getByText('Still over the limit by ₹50,000.00.')).toBeTruthy();
    type('300000');
    expect(screen.getByText('₹1,50,000.00 of room left · 50% used.')).toBeTruthy();
  });

  it('cannot save until the limit changes', async () => {
    mount();
    await openSheet();
    expect((screen.getByRole('button', { name: 'Save limit' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    type('250000');
    expect((screen.getByRole('button', { name: 'Save limit' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('rejects a negative amount inline without calling the API', async () => {
    mount();
    await openSheet();
    type('-5');
    save();
    expect(await screen.findByText('Enter 0 or more.')).toBeTruthy();
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(update).not.toHaveBeenCalled();
  });

  it('closes on Cancel and on Escape without saving', async () => {
    mount();
    const dialog = await openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const again = await openSheet();
    fireEvent.keyDown(again, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(dialog).toBeTruthy();
  });
});

describe('saving', () => {
  it('sends only the limit with an Idempotency-Key, then the bar and state update at once', async () => {
    const { qc } = mount();
    await waitFor(() => expect(balance().getAttribute('data-state')).toBe('under'));
    await openSheet();
    type('120000');
    save();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(update).toHaveBeenCalledTimes(1);
    const [id, payload, opts] = update.mock.calls[0];
    expect(id).toBe('c1');
    expect(payload).toEqual({ creditLimit: 120000 });
    expect(opts?.idempotencyKey).toBeTruthy();

    // 150,000 owed against 1,20,000: now over the limit.
    await waitFor(() => expect(balance().getAttribute('data-state')).toBe('over'));
    expect(within(balance()).getByText('Over limit')).toBeTruthy();
    expect(within(balance()).getByText('Limit ₹1,20,000.00')).toBeTruthy();
    expect(screen.getByText('Credit limit updated.')).toBeTruthy();
    expect(qc.getQueryState(ui.queryKeys.customers(true))?.isInvalidated).toBeDefined();
  });

  it('blank removes the limit', async () => {
    mount();
    await openSheet();
    type('');
    save();
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1]).toEqual({ creditLimit: null });
    expect(await screen.findByText('Credit limit removed.')).toBeTruthy();
    await waitFor(() => expect(within(balance()).getByText('No credit limit set.')).toBeTruthy());
  });

  it('shows a Restricted Access refusal inline and keeps the sheet open', async () => {
    update.mockRejectedValue(
      refusal('SUBSCRIPTION_RESTRICTED', 'Your subscription has lapsed. Contact your owner.'),
    );
    mount();
    await openSheet();
    type('90000');
    // The server now reports the restriction; the refusal makes the client re-read it.
    accessMode = 'RESTRICTED';
    save();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Your subscription has lapsed. Contact your owner.');
    expect(screen.getByRole('dialog', { name: 'Edit credit limit' })).toBeTruthy();
    // The action behind the sheet greys out.
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Edit limit', hidden: true }) as HTMLButtonElement)
          .disabled,
      ).toBe(true),
    );
  });

  it('answers a server validation refusal on the sheet', async () => {
    update.mockRejectedValue(refusal('VALIDATION_ERROR', 'Invalid UpdateCustomer command', 400));
    mount();
    await openSheet();
    type('90000');
    save();
    expect((await screen.findByRole('alert')).textContent).toMatch(/valid amount/i);
  });

  it('reuses the key after a dropped connection and takes a fresh one after a refusal', async () => {
    update.mockRejectedValueOnce(Object.assign(new Error('Network error'), { code: 'NETWORK' }));
    mount();
    await openSheet();
    type('90000');
    save();
    await screen.findByRole('alert');

    update.mockRejectedValueOnce(refusal('FORBIDDEN', 'No', 403));
    save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    await screen.findByText(/permission/i);

    save();
    await waitFor(() => expect(update).toHaveBeenCalledTimes(3));
    const keys = update.mock.calls.map((c) => c[2]?.idempotencyKey);
    expect(keys[1]).toBe(keys[0]); // unknown outcome: same key
    expect(keys[2]).not.toBe(keys[1]); // decided refusal was cached: new key
  });
});

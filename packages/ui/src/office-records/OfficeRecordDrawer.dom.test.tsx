/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { resolveEntryDate } from '@pump/shared';
import {
  createTestQueryClient,
  muteExpectedConsoleErrors,
  renderWithProviders,
} from '../test/renderWithProviders.js';

const recordExpense = vi.fn();
const recordIncome = vi.fn();
const recordCollection = vi.fn();
const recordPurchase = vi.fn();
const recordSupplierPayment = vi.fn();
const createExpenseCategory = vi.fn();

vi.mock('../services/cloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CloudTransactionService: class {
    recordExpense = recordExpense;
    recordIncome = recordIncome;
    recordCollection = recordCollection;
    recordPurchase = recordPurchase;
    recordSupplierPayment = recordSupplierPayment;
    createExpenseCategory = createExpenseCategory;
  },
}));

const { queryKeys } = await import('../query/hooks.js');
const { QuickEntryHost } = await import('../quick-entry/QuickEntryHost.js');
const { openQuickEntry, closeQuickEntry } = await import('../quick-entry/store.js');
const { ExpensesList } = await import('../components/ExpensesList.js');

const STATION = { id: 'st-1', settings: { timezone: 'Asia/Kolkata' } };
const TODAY = resolveEntryDate({ timeZone: 'Asia/Kolkata' });

const ACCOUNTS = [
  { id: 'cash', name: 'Cash in Hand', accountType: 'CASH_IN_HAND', stationId: 'st-1' },
  { id: 'bank', name: 'HDFC Current', accountType: 'BANK', stationId: 'st-1' },
  { id: 'cms', name: 'BPCL CMS', accountType: 'CMS', stationId: 'st-1' },
];
const CATEGORIES = [
  { id: 'cat-power', name: 'Electricity' },
  { id: 'cat-tea', name: 'Tea & snacks' },
];
const CUSTOMERS = [{ id: 'cu-1', name: 'Kaveri Travels', currentBalance: '5000' }];
const SUPPLIERS = [{ id: 'sup-1', name: 'Bharat Fuels', currentBalance: 5000 }];
const OIL = {
  id: 'p-oil',
  name: 'Engine Oil',
  productType: 'MERCHANDISE',
  unit: 'unit',
  taxCategory: 'GST',
  taxConfig: { gst_rate: 18 },
};

const seeded = (over: { expenses?: any[] } = {}) => {
  const qc = createTestQueryClient();
  qc.setQueryData(queryKeys.fundingAccounts('st-1'), ACCOUNTS);
  qc.setQueryData(queryKeys.financialAccounts('st-1'), [
    { id: 'cash', balance: '3000' },
    { id: 'bank', balance: '100000' },
  ]);
  qc.setQueryData(queryKeys.paymentTerminals('st-1'), [
    { id: 'pos-1', label: 'Pine POS', supportsCard: true, supportsUpi: false, isActive: true },
  ]);
  qc.setQueryData(queryKeys.expenseCategories(), CATEGORIES);
  qc.setQueryData(queryKeys.incomeCategories(), CATEGORIES);
  qc.setQueryData(queryKeys.customers(true), CUSTOMERS);
  qc.setQueryData(queryKeys.suppliers(true), SUPPLIERS);
  qc.setQueryData(queryKeys.products(), [OIL]);
  qc.setQueryData(queryKeys.expenses(), over.expenses ?? []);
  return qc;
};

const host = (role: 'Owner' | 'Staff' = 'Owner', queryClient = seeded()) =>
  renderWithProviders(<QuickEntryHost selectedStation={STATION} userRole={role} />, {
    queryClient,
  });

const open = (...args: Parameters<typeof openQuickEntry>) => act(() => openQuickEntry(...args));

const drawer = () => document.querySelector('.drawer-container') as HTMLElement;
const title = () => drawer().querySelector('.drawer-title')?.textContent;
const fieldLabels = () =>
  Array.from(drawer().querySelectorAll('.field-label')).map((l) => l.textContent);
const record = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
const setAmount = (value: string, label = 'Amount') =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const chooseCategory = (id: string) =>
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: id } });

const network = () => Object.assign(new Error('offline'), { code: 'NETWORK' });

let restoreConsole: () => void;
beforeEach(() => {
  for (const fn of [
    recordExpense,
    recordIncome,
    recordCollection,
    recordPurchase,
    recordSupplierPayment,
    createExpenseCategory,
  ])
    fn.mockReset().mockResolvedValue({});
  restoreConsole = muteExpectedConsoleErrors([/not wrapped in act/]);
});
afterEach(() => {
  act(() => closeQuickEntry());
  cleanup();
  restoreConsole();
});

describe('Office Record drawer: one entry definition per kind (#526)', () => {
  it('has the same title and fields from the page button and the New menu', async () => {
    renderWithProviders(
      <>
        <ExpensesList selectedStation={STATION} userRole="Owner" />
        <QuickEntryHost selectedStation={STATION} userRole="Owner" />
      </>,
      { queryClient: seeded() },
    );
    fireEvent.click(await screen.findByRole('button', { name: /Record expense/ }));
    const fromPage = { title: title(), fields: fieldLabels() };
    expect(fromPage.title).toBe('Record expense');
    expect(screen.getByText('Office record · dated by entry date')).toBeTruthy();
    act(() => closeQuickEntry());

    open('expense', { origin: 'new' });
    expect(title()).toBe(fromPage.title);
    expect(fieldLabels()).toEqual(fromPage.fields);
    expect(fromPage.fields).toEqual([
      'Entry date*',
      'Category*',
      'Amount*',
      'Funding account*',
      'Description',
    ]);
  });

  it('keeps one title from Shifts, and says the record is not part of the shift', () => {
    host();
    open('collection', { origin: 'shifts', shiftName: 'Morning' });
    expect(title()).toBe('Record collection');
    expect(screen.getByText('Office record · not part of Morning')).toBeTruthy();
    expect(screen.queryByText(/Morning ·/)).toBeNull();
  });

  it('puts Cancel, Record and "Add another after saving" in the pinned footer', () => {
    host();
    open('income', { origin: 'new' });
    const footer = document.querySelector('.drawer-footer') as HTMLElement;
    expect(within(footer).getByRole('button', { name: 'Record income' })).toBeTruthy();
    expect(within(footer).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(within(footer).getByLabelText('Add another after saving')).toBeTruthy();
    expect(
      within(drawer().querySelector('.drawer-body')!).queryByRole('button', { name: 'Cancel' }),
    ).toBeNull();
  });
});

describe('expense', () => {
  it('refuses to save without a funding account', async () => {
    host();
    open('expense', { origin: 'page' });
    chooseCategory('cat-tea');
    setAmount('50');
    await record('Record expense');
    await waitFor(() => expect(screen.getByText('Choose the account')).toBeTruthy());
    expect(recordExpense).not.toHaveBeenCalled();
  });

  it('sends the entry date, account and an Idempotency-Key, then closes', async () => {
    host();
    open('expense', { origin: 'page' });
    fireEvent.change(document.querySelector('[name="entryDate"]')!, {
      target: { value: '2026-01-15' },
    });
    chooseCategory('cat-tea');
    setAmount('50');
    fireEvent.click(screen.getByRole('radio', { name: /HDFC Current/ }));
    await record('Record expense');
    await waitFor(() => expect(recordExpense).toHaveBeenCalledTimes(1));
    const [payload, opts] = recordExpense.mock.calls[0];
    expect(payload).toEqual({
      stationId: 'st-1',
      entryDate: '2026-01-15',
      fundingAccountId: 'bank',
      categoryId: 'cat-tea',
      amount: 50,
    });
    expect(payload).not.toHaveProperty('shiftId');
    expect(opts.idempotencyKey).toEqual(expect.any(String));
    expect(await screen.findByText('Expense recorded.')).toBeTruthy();
    expect(drawer()).toBeNull();
  });

  it('saves with ⌘/Ctrl+Enter', async () => {
    host();
    open('expense', { origin: 'page' });
    chooseCategory('cat-tea');
    setAmount('80');
    fireEvent.click(screen.getByRole('radio', { name: /Cash in Hand/ }));
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    });
    await waitFor(() => expect(recordExpense).toHaveBeenCalledTimes(1));
  });

  it('"Add another after saving" stays open and keeps the date and account', async () => {
    host();
    open('expense', { origin: 'page' });
    chooseCategory('cat-tea');
    setAmount('80');
    fireEvent.click(screen.getByRole('radio', { name: /HDFC Current/ }));
    fireEvent.click(screen.getByLabelText('Add another after saving'));
    await record('Record expense');
    await waitFor(() => expect(recordExpense).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe(''),
    );
    expect((screen.getByRole('radio', { name: /HDFC Current/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((document.querySelector('[name="entryDate"]') as HTMLInputElement).value).toBe(TODAY);

    chooseCategory('cat-power');
    setAmount('120');
    await record('Record expense');
    await waitFor(() => expect(recordExpense).toHaveBeenCalledTimes(2));
    const [k1, k2] = recordExpense.mock.calls.map((c) => c[1].idempotencyKey);
    expect(k2).not.toBe(k1); // a new record, a new key
  });

  it('shows the balance move and flags a possible repeat in the preview strip', () => {
    host(
      'Owner',
      seeded({
        expenses: [{ entryDate: TODAY, amount: '4200', categoryId: 'cat-power', status: 'ACTIVE' }],
      }),
    );
    open('expense', { origin: 'new' });
    chooseCategory('cat-power');
    setAmount('4200');
    fireEvent.click(screen.getByRole('radio', { name: /HDFC Current/ }));
    const strip = screen.getByRole('button', { name: /Preview/ });
    expect(within(strip).getByText('Possible repeat')).toBeTruthy();
    expect(within(strip).getByText('HDFC Current')).toBeTruthy();
    fireEvent.click(strip);
    expect(screen.getByText('Balances')).toBeTruthy();
    expect(screen.getByText(/Looks like a repeat/)).toBeTruthy();
  });

  it('warns that Cash in Hand would go negative, without blocking the save', async () => {
    host();
    open('expense', { origin: 'new' });
    chooseCategory('cat-tea');
    setAmount('5000');
    fireEvent.click(screen.getByRole('radio', { name: /Cash in Hand/ }));
    expect(screen.getByText('Goes negative')).toBeTruthy();
    await record('Record expense');
    await waitFor(() => expect(recordExpense).toHaveBeenCalledTimes(1));
  });

  it('lets an Owner add a category from the picker and chooses it', async () => {
    createExpenseCategory.mockResolvedValue({ id: 'cat-new', name: 'Generator diesel' });
    host('Owner');
    open('expense', { origin: 'page' });
    chooseCategory('__new');
    fireEvent.change(screen.getByLabelText('New category name'), {
      target: { value: 'Generator diesel' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    });
    expect(createExpenseCategory).toHaveBeenCalledWith({ name: 'Generator diesel' });
    await waitFor(() =>
      expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('cat-new'),
    );
  });

  it('does not offer "+ New category…" to Staff', () => {
    host('Staff');
    open('expense', { origin: 'page' });
    expect(screen.queryByRole('option', { name: '+ New category…' })).toBeNull();
  });
});

describe('collection', () => {
  it('requires the customer: there is no walk-in', async () => {
    host();
    open('collection', { origin: 'new' });
    setAmount('900');
    await record('Record collection');
    await waitFor(() => expect(screen.getByText('Choose the customer who paid.')).toBeTruthy());
    expect(recordCollection).not.toHaveBeenCalled();
  });

  it('preselects the only cash account and flags an advance', async () => {
    host();
    open('collection', { origin: 'statement', party: CUSTOMERS[0] });
    expect(screen.getByText('From statement')).toBeTruthy();
    setAmount('6000');
    expect(screen.getByText('Advance')).toBeTruthy();
    await record('Record collection');
    await waitFor(() => expect(recordCollection).toHaveBeenCalledTimes(1));
    expect(recordCollection.mock.calls[0][0]).toMatchObject({
      customerId: 'cu-1',
      paymentMethod: 'Cash',
      fundingAccountId: 'cash',
      amount: 6000,
    });
    expect(recordCollection.mock.calls[0][1].idempotencyKey).toEqual(expect.any(String));
  });

  it('sends a card collection through the terminal and hides the account choice', async () => {
    host();
    open('collection', { origin: 'statement', party: CUSTOMERS[0] });
    fireEvent.click(screen.getByRole('radio', { name: 'Card' }));
    fireEvent.change(screen.getByLabelText('Payment terminal'), { target: { value: 'pos-1' } });
    expect(screen.queryByRole('radiogroup', { name: 'Funding account' })).toBeNull();
    setAmount('900');
    await record('Record collection');
    await waitFor(() => expect(recordCollection).toHaveBeenCalledTimes(1));
    expect(recordCollection.mock.calls[0][0]).toMatchObject({
      paymentMethod: 'Card',
      terminalId: 'pos-1',
      fundingAccountId: undefined,
    });
  });
});

describe('supplier payment', () => {
  it('opens from the New menu in place, with every supplier to pick from', () => {
    host();
    open('supplier-payment', { origin: 'new' });
    expect(title()).toBe('Record supplier payment');
    expect(screen.getByText('Choose a supplier')).toBeTruthy();
  });

  it('from a statement, fixes the supplier and starts at what is owed', async () => {
    host();
    open('supplier-payment', { origin: 'statement', party: SUPPLIERS[0] });
    expect(screen.getByText('From statement')).toBeTruthy();
    expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('5000');
    fireEvent.click(screen.getByRole('radio', { name: /BPCL CMS/ }));
    await record('Record supplier payment');
    await waitFor(() => expect(recordSupplierPayment).toHaveBeenCalledTimes(1));
    const [payload, opts] = recordSupplierPayment.mock.calls[0];
    expect(payload).toMatchObject({
      stationId: 'st-1',
      supplierId: 'sup-1',
      fundingAccountId: 'cms',
      amount: 5000,
      entryDate: TODAY,
    });
    expect(payload).not.toHaveProperty('shiftId');
    expect(opts.idempotencyKey).toEqual(expect.any(String));
  });

  it('says why an amount is refused instead of doing nothing', async () => {
    host();
    open('supplier-payment', { origin: 'statement', party: SUPPLIERS[0] });
    setAmount('10000000000');
    await record('Record supplier payment');
    await waitFor(() =>
      expect(screen.getByText('That is more than a payment can hold.')).toBeTruthy(),
    );
    expect(recordSupplierPayment).not.toHaveBeenCalled();
  });

  it('keeps the key after a network drop and renews it after a refusal', async () => {
    recordSupplierPayment
      .mockRejectedValueOnce(network())
      .mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 403, code: 'FORBIDDEN' }))
      .mockResolvedValue({});
    host();
    open('supplier-payment', { origin: 'statement', party: SUPPLIERS[0] });
    fireEvent.click(screen.getByRole('radio', { name: /HDFC Current/ }));
    await record('Record supplier payment');
    expect(
      await screen.findByText(
        'Saving again sends the same record, so it cannot be recorded twice.',
      ),
    ).toBeTruthy();
    await record('Record supplier payment');
    expect(await screen.findByText('nope')).toBeTruthy();
    await record('Record supplier payment');
    await waitFor(() => expect(recordSupplierPayment).toHaveBeenCalledTimes(3));
    const keys = recordSupplierPayment.mock.calls.map((c) => c[1].idempotencyKey);
    expect(keys[1]).toBe(keys[0]); // outcome unknown: same key
    expect(keys[2]).not.toBe(keys[1]); // 403 decided: a fresh key
  });
});

describe('purchase', () => {
  const productPurchase = async () => {
    host();
    open('purchase', {
      origin: 'page',
      defaults: {
        supplierId: 'sup-1',
        lines: [{ productId: OIL.id, quantity: 10, unitPrice: 450 }],
      },
    });
  };

  it('records no supplier payment unless asked', async () => {
    await productPurchase();
    expect(
      (
        screen.getByRole('checkbox', {
          name: /Also record a supplier payment now/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    await record('Record purchase');
    await waitFor(() => expect(recordPurchase).toHaveBeenCalledTimes(1));
    expect(recordPurchase.mock.calls[0][0].payment).toBeUndefined();
  });

  it('saves the purchase and its supplier payment in one request', async () => {
    await productPurchase();
    fireEvent.click(screen.getByRole('checkbox', { name: /Also record a supplier payment now/ }));
    // 10 × ₹450 + 18% GST = ₹5,310, prefilled as the amount paid.
    expect((screen.getByLabelText('Amount paid') as HTMLInputElement).value).toBe('5310.00');
    fireEvent.click(screen.getByRole('radio', { name: /HDFC Current/ }));
    await record('Record purchase');
    await waitFor(() => expect(recordPurchase).toHaveBeenCalledTimes(1));
    const [payload, opts] = recordPurchase.mock.calls[0];
    expect(payload).toMatchObject({
      stationId: 'st-1',
      supplierId: 'sup-1',
      payment: { amount: 5310, fundingAccountId: 'bank' },
    });
    expect(payload.payment.entryDate).toBe(payload.transactionDate);
    expect(opts.idempotencyKey).toEqual(expect.any(String));
    expect(recordSupplierPayment).not.toHaveBeenCalled();
    expect(await screen.findByText('Purchase and supplier payment recorded.')).toBeTruthy();
  });
});

/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { resolveEntryDate, shiftBusinessDate } from '@pump/shared';
import { calendarDay, datePicker, pickDate, pickedDate } from '../test/datePicker.js';
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

vi.mock('../services/cloud.js', async (importOriginal) => {
  const real = await importOriginal<Record<string, any>>();
  const writes: Record<string, unknown> = {
    recordExpense,
    recordIncome,
    recordCollection,
    recordPurchase,
    recordSupplierPayment,
    createExpenseCategory,
    // A refetch after adding a category must not drop the one just added.
    getExpenseCategories: () => new Promise(() => {}),
  };
  // Every service answers its reads with an empty list (the tests seed what
  // they need); the writes are the spies above.
  const service = (own: Record<string, unknown>) =>
    class {
      constructor() {
        return new Proxy(own, {
          get: (target, name: string) =>
            name in target ? target[name] : name === 'then' ? undefined : async () => [],
        });
      }
    };
  const mocked = Object.fromEntries(
    Object.keys(real)
      .filter((name) => /^Cloud\w*Service$/.test(name))
      .map((name) => [name, service(name === 'CloudTransactionService' ? writes : {})]),
  );
  return { ...real, ...mocked };
});

// Radix's menu popup loops forever in jsdom, so the menus render open and
// inline; AppTopBar's own items and their onSelect are what is under test.
vi.mock('../pump-ds/menu/index.js', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    Menu: Pass,
    MenuTrigger: Pass,
    MenuGroup: Pass,
    MenuSeparator: () => null,
    MenuLabel: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    MenuContent: ({ children }: { children?: React.ReactNode }) => (
      <div role="menu">{children}</div>
    ),
    MenuItem: ({ children, onSelect }: { children?: React.ReactNode; onSelect?: () => void }) => (
      <div role="menuitem" tabIndex={-1} onClick={() => onSelect?.()}>
        {children}
      </div>
    ),
  };
});

const { queryKeys } = await import('../query/hooks.js');
const { QuickEntryHost } = await import('../quick-entry/QuickEntryHost.js');
const { openQuickEntry, closeQuickEntry } = await import('../quick-entry/store.js');
const { ExpensesList } = await import('../components/ExpensesList.js');
const { IncomeList } = await import('../components/IncomeList.js');
const { CustomersList } = await import('../components/CustomersList.js');
const { PurchasesList } = await import('../components/PurchasesList.js');
const { AppTopBar } = await import('../components/AppTopBar.js');
const { OFFICE_RECORD_KINDS } = await import('./kinds.js');
type OfficeRecordKind = import('./kinds.js').OfficeRecordKind;

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
  qc.setQueryData(queryKeys.stationSuppliers('st-1', true), SUPPLIERS);
  qc.setQueryData(queryKeys.products(), [OIL]);
  qc.setQueryData(queryKeys.expenses(), over.expenses ?? []);
  return qc;
};

const host = (role: 'Owner' | 'Staff' = 'Owner', queryClient = seeded(), station = STATION) =>
  renderWithProviders(<QuickEntryHost selectedStation={station} userRole={role} />, {
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
const keyReused = () =>
  Object.assign(new Error('This Idempotency-Key was already used with different request content'), {
    status: 409,
    code: 'IDEMPOTENCY_KEY_REUSED',
  });

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
  type PageCase = [OfficeRecordKind, string, () => React.ReactElement, RegExp, string?];
  const pages: PageCase[] = [
    [
      'expense',
      'Expense',
      () => <ExpensesList selectedStation={STATION} userRole="Owner" />,
      /Record expense/,
    ],
    [
      'income',
      'Income',
      () => <IncomeList selectedStation={STATION} userRole="Owner" />,
      /Record income/,
    ],
    [
      'collection',
      'Collection',
      () => <CustomersList selectedStation={STATION} userRole="Owner" />,
      /Record collection/,
      'Collections',
    ],
    [
      'purchase',
      'Purchase',
      () => <PurchasesList selectedStation={STATION} />,
      /Record purchase/,
      'Purchases',
    ],
    [
      'supplier-payment',
      'Supplier payment',
      () => <PurchasesList selectedStation={STATION} />,
      /Record supplier payment/,
    ],
  ];

  const topBar = (role: 'Owner' | 'Manager' | 'Staff') => (
    <AppTopBar
      selectedStation={{ ...STATION, name: 'Kochi' } as any}
      navItems={[]}
      userRole={role}
      userName="Asha"
      syncStatus="synced"
      onNavigate={() => {}}
      onLogout={() => {}}
    />
  );

  /** The top bar's "New" menu: the one under its "Create" label. */
  const openNewMenu = async () => {
    expect(screen.getByRole('button', { name: 'New' })).toBeTruthy();
    const menus = await screen.findAllByRole('menu');
    const menu = menus.find((m) => within(m).queryByText('Create'));
    if (!menu) throw new Error('no New menu');
    return menu;
  };

  const shape = () => ({
    title: title(),
    fields: fieldLabels(),
    submit: within(document.querySelector('.drawer-footer') as HTMLElement)
      .getAllByRole('button')
      .map((b) => b.getAttribute('type'))
      .includes('submit'),
    submitName: (document.querySelector('.drawer-footer button[type="submit"]') as HTMLElement)
      ?.textContent,
  });

  it.each(pages)(
    '%s: same title, fields and submit from its page and from the New menu',
    async (kind, menuLabel, page, button, tab) => {
      const { unmount } = renderWithProviders(
        <>
          {page()}
          <QuickEntryHost selectedStation={STATION} userRole="Owner" />
        </>,
        { queryClient: seeded() },
      );
      if (tab) fireEvent.click(await screen.findByRole('tab', { name: new RegExp(tab) }));
      fireEvent.click((await screen.findAllByRole('button', { name: button }))[0]);
      const fromPage = shape();
      expect(fromPage.title).toBe(OFFICE_RECORD_KINDS[kind].title);
      expect(fromPage.fields.length).toBeGreaterThan(2);
      act(() => closeQuickEntry());
      unmount();

      renderWithProviders(
        <>
          {topBar('Owner')}
          <QuickEntryHost selectedStation={STATION} userRole="Owner" />
        </>,
        { queryClient: seeded() },
      );
      const menu = await openNewMenu();
      await act(async () => {
        fireEvent.click(within(menu).getByRole('menuitem', { name: menuLabel }));
      });
      await waitFor(() => expect(drawer()).toBeTruthy());
      expect(shape()).toEqual(fromPage);
    },
  );

  it('offers Staff only the Office Records Staff may record: Expense, Income, Collection, and no Customer', async () => {
    renderWithProviders(topBar('Staff'), { queryClient: seeded() });
    const menu = await openNewMenu();
    const items = within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent);
    expect(items).toEqual(expect.arrayContaining(['Expense', 'Income', 'Collection']));
    expect(items).not.toContain('Purchase');
    expect(items).not.toContain('Supplier payment');
    // Staff may not create customers (canCreateCustomer).
    expect(items).not.toContain('Customer');
  });

  it.each(['Owner', 'Manager'] as const)('offers %s Customer in the New menu', async (role) => {
    renderWithProviders(topBar(role), { queryClient: seeded() });
    const menu = await openNewMenu();
    const items = within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent);
    expect(items).toContain('Customer');
  });

  it.each(['expense', 'income', 'collection', 'supplier-payment'] as const)(
    '%s: the amount is the large figure beside its ₹, not a right-aligned input',
    (kind) => {
      host();
      open(kind, { origin: 'new' });
      const amount = screen.getByLabelText('Amount');
      expect(amount.className).toContain('record-amount');
      expect(amount.className).not.toContain('input-numeric');
    },
  );

  it('lists the expense fields in the spine order', async () => {
    host();
    open('expense', { origin: 'page' });
    expect(fieldLabels()).toEqual([
      'Entry date* (required)',
      'Category* (required)',
      'Amount* (required)',
      'Funding account* (required)',
      'Description',
    ]);
    expect(screen.getByText('Office record · dated by entry date')).toBeTruthy();
  });

  it('keeps one title from Shifts, and says the record is not part of the shift', () => {
    host();
    open('collection', { origin: 'shifts', shiftName: 'Morning' });
    expect(title()).toBe('Record collection');
    expect(screen.getByText('Office record · not part of Morning')).toBeTruthy();
    expect(screen.queryByText(/Morning ·/)).toBeNull();
  });

  it('a product purchase opened from Shifts reads as a Business Day purchase', () => {
    host();
    open('purchase', { origin: 'shifts', shiftName: 'Morning', purchaseType: 'PRODUCTS' });
    expect(screen.getByText(/^Product purchase · Business Day /)).toBeTruthy();
    expect(screen.queryByText(/not part of Morning/)).toBeNull();
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
    pickDate('Entry date', '2026-01-15');
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
    expect(pickedDate('Entry date')).toBe(TODAY);

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
        expenses: [
          {
            stationId: 'st-1',
            entryDate: TODAY,
            amount: '4200',
            categoryId: 'cat-power',
            status: 'ACTIVE',
          },
        ],
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

  it("ignores another station's records in the repeat check", () => {
    host(
      'Owner',
      seeded({
        expenses: [
          {
            stationId: 'st-2',
            entryDate: TODAY,
            amount: '4200',
            categoryId: 'cat-power',
            status: 'ACTIVE',
          },
        ],
      }),
    );
    open('expense', { origin: 'new' });
    chooseCategory('cat-power');
    setAmount('4200');
    expect(screen.queryByText('Possible repeat')).toBeNull();
  });

  it('re-checks for a repeat when the list loads after the drawer opened', () => {
    const qc = seeded();
    host('Owner', qc);
    open('expense', { origin: 'new' });
    chooseCategory('cat-power');
    setAmount('4200');
    expect(screen.queryByText('Possible repeat')).toBeNull();
    act(() => {
      qc.setQueryData(queryKeys.expenses(), [
        { stationId: 'st-1', entryDate: TODAY, amount: '4200', categoryId: 'cat-power' },
      ]);
    });
    expect(screen.getByText('Possible repeat')).toBeTruthy();
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

  it("prefills what THIS Station owes, never the organization's balance (#575)", async () => {
    const qc = seeded();
    // The organization owes Bharat 9,000 across both pumps; this Station owes 5,000.
    qc.setQueryData(queryKeys.suppliers(true), [{ ...SUPPLIERS[0], currentBalance: 9000 }]);
    host('Owner', qc);
    open('supplier-payment', {
      origin: 'statement',
      party: { ...SUPPLIERS[0], currentBalance: 9000 },
    });
    expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('5000');
    expect(screen.getByText('₹5,000.00 owed.')).toBeTruthy();
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

  it('keeps the key when an edited retry is refused as a key conflict', async () => {
    recordSupplierPayment
      .mockRejectedValueOnce(network())
      .mockRejectedValueOnce(keyReused())
      .mockResolvedValue({});
    host();
    open('supplier-payment', { origin: 'statement', party: SUPPLIERS[0] });
    fireEvent.click(screen.getByRole('radio', { name: /HDFC Current/ }));
    await record('Record supplier payment');
    await screen.findByText('Saving again sends the same record, so it cannot be recorded twice.');
    setAmount('4000');
    await record('Record supplier payment');
    expect(
      await screen.findByText(
        'Your earlier save may already be recorded. Check the list, then undo your edit or close and start again.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/already used with different request content/)).toBeNull();
    await record('Record supplier payment');
    await waitFor(() => expect(recordSupplierPayment).toHaveBeenCalledTimes(3));
    const keys = recordSupplierPayment.mock.calls.map((c) => c[1].idempotencyKey);
    expect(new Set(keys).size).toBe(1);
  });

  it('saves the corrected record under a fresh key after closing a key conflict', async () => {
    recordSupplierPayment
      .mockRejectedValueOnce(network())
      .mockRejectedValueOnce(keyReused())
      .mockResolvedValue({});
    host();
    const start = () => {
      open('supplier-payment', { origin: 'statement', party: SUPPLIERS[0] });
      fireEvent.click(screen.getByRole('radio', { name: /HDFC Current/ }));
    };
    start();
    await record('Record supplier payment');
    await screen.findByText('Saving again sends the same record, so it cannot be recorded twice.');
    setAmount('4000');
    await record('Record supplier payment');
    await screen.findByText(/Your earlier save may already be recorded/);

    // Close and start again with the corrected record.
    act(() => closeQuickEntry());
    start();
    setAmount('4000');
    await record('Record supplier payment');
    await waitFor(() => expect(recordSupplierPayment).toHaveBeenCalledTimes(3));
    expect(screen.queryByText(/Your earlier save may already be recorded/)).toBeNull();
    const keys = recordSupplierPayment.mock.calls.map((c) => c[1].idempotencyKey);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(recordSupplierPayment.mock.calls[2][0]).toMatchObject({ amount: 4000 });
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

  const payNow = () =>
    fireEvent.click(screen.getByRole('checkbox', { name: /Also record a supplier payment now/ }));
  const paymentDate = () => pickedDate('Payment date');
  const setQuantity = (value: string) =>
    fireEvent.change(document.querySelector('[name="lines.0.quantity"]')!, { target: { value } });

  it('gives the payment its own date, following the invoice date until edited', async () => {
    host();
    open('purchase', { origin: 'page', purchaseType: 'FUEL', defaults: { supplierId: 'sup-1' } });
    payNow();
    expect(paymentDate()).toBe(TODAY);
    pickDate('Invoice date', '2026-01-10');
    expect(paymentDate()).toBe('2026-01-10');
    expect(screen.getByText(/Saved as its own Supplier payment, dated 10 Jan 2026/)).toBeTruthy();

    pickDate('Payment date', '2026-01-12');
    pickDate('Invoice date', '2026-01-09');
    expect(paymentDate()).toBe('2026-01-12');
    expect(screen.getByText(/Saved as its own Supplier payment, dated 12 Jan 2026/)).toBeTruthy();
  });

  it('offers no payment date after today', async () => {
    await productPurchase();
    payNow();
    fireEvent.click(datePicker('Payment date'));
    expect(calendarDay(TODAY)?.disabled).toBe(false);
    // Tomorrow is either disabled in this month or behind a disabled "Next month".
    const tomorrow = calendarDay(shiftBusinessDate(TODAY, 1));
    expect(tomorrow == null || tomorrow.disabled).toBe(true);
  });

  it('asks for the pay-now account inside the form', async () => {
    await productPurchase();
    payNow();
    await record('Record purchase');
    await waitFor(() => expect(screen.getByText('Choose the account')).toBeTruthy());
    expect(recordPurchase).not.toHaveBeenCalled();
  });

  it('keeps the amount paid on the invoice total until the operator edits it', () => {
    host();
    open('purchase', {
      origin: 'page',
      defaults: {
        supplierId: 'sup-1',
        lines: [{ productId: OIL.id, quantity: 10, unitPrice: 450 }],
      },
    });
    payNow();
    const paid = () => (screen.getByLabelText('Amount paid') as HTMLInputElement).value;
    expect(paid()).toBe('5310.00');
    setQuantity('20'); // 20 × ₹450 + 18% = ₹10,620
    expect(paid()).toBe('10620.00');
    fireEvent.change(screen.getByLabelText('Amount paid'), { target: { value: '5000' } });
    setQuantity('5');
    expect(paid()).toBe('5000');
  });

  describe('before Day Start', () => {
    // 04:30 in Kolkata on 15 Oct, Day Start 06:00: the Business Day is still 14 Oct.
    const EARLY = {
      id: 'st-1',
      settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
    };
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-14T23:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("dates a product purchase's payment today, not by the Business Day", async () => {
      host('Owner', seeded(), EARLY);
      open('purchase', {
        origin: 'page',
        purchaseType: 'PRODUCTS',
        defaults: {
          supplierId: 'sup-1',
          lines: [{ productId: OIL.id, quantity: 10, unitPrice: 450 }],
        },
      });
      expect(pickedDate('Business date')).toBe('2026-10-14');
      payNow();
      expect(paymentDate()).toBe('2026-10-15');
      fireEvent.click(screen.getByRole('radio', { name: /HDFC Current/ }));
      await record('Record purchase');
      await waitFor(() => expect(recordPurchase).toHaveBeenCalledTimes(1));
      expect(recordPurchase.mock.calls[0][0]).toMatchObject({
        transactionDate: '2026-10-14',
        payment: { entryDate: '2026-10-15' },
      });
    });
  });

  it('"Add another" keeps the type, the pay-now account and the payment date', async () => {
    host();
    open('purchase', {
      origin: 'page',
      defaults: {
        supplierId: 'sup-1',
        lines: [{ productId: OIL.id, quantity: 10, unitPrice: 450 }],
      },
    });
    payNow();
    fireEvent.click(screen.getByRole('radio', { name: /HDFC Current/ }));
    const earlier = shiftBusinessDate(TODAY, -1);
    pickDate('Payment date', earlier);
    fireEvent.click(screen.getByLabelText('Add another after saving'));
    await record('Record purchase');
    await waitFor(() => expect(recordPurchase).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Products' }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    );
    expect(screen.getByText('Business date')).toBeTruthy();
    expect((screen.getByRole('radio', { name: /HDFC Current/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(paymentDate()).toBe(earlier);
    expect((document.querySelector('[name="lines.0.quantity"]') as HTMLInputElement).value).toBe(
      '',
    );
  });
});

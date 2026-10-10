// @vitest-environment jsdom
import React, { useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

/**
 * Money tab: To collect / To pay lists and the Customer page. `@pump/ui` is the
 * mock seam for the customers / suppliers lists and the customer ledger, as in
 * the other mobile screen tests.
 */
const customers: any[] = [];
const suppliers: any[] = [];
const ledgers: Record<string, any[]> = {};
const ledgerState = { isLoading: false, isError: false, placeholder: false };
const supplierLedgers: Record<string, any[]> = {};
/** The receivables summary for the list and per customer; `undefined` = not (yet) available. */
const receivables: { list: any; byCustomer: Record<string, any>; failed: boolean } = {
  list: undefined,
  byCustomer: {},
  failed: false,
};
/** Opening balance of a customer's statement window, and the windows asked for. */
const openings: Record<string, string> = {};
/** Whether a customer has any entry before the window; unset = whenever the opening balance is not 0. */
const earlier: Record<string, boolean> = {};
const statementCalls: Array<{ id: string; from: string; to: string }> = [];
const supplierStatementCalls: Array<{ id: string; from: string; to: string }> = [];
/** The payables summary for the list and per supplier; `undefined` = not (yet) available. */
const payables: { list: any; bySupplier: Record<string, any>; failed: boolean } = {
  list: undefined,
  bySupplier: {},
  failed: false,
};

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useAccess: () => ({ data: undefined }),
    useCustomers: () => ({ data: customers, isLoading: false }),
    useSuppliers: () => ({ data: suppliers, isLoading: false }),
    useSupplierStatement: (id: string, range: { from: string; to: string }) => {
      supplierStatementCalls.push({ id, ...range });
      return {
        data: ledgerState.isLoading
          ? undefined
          : {
              periodOpeningBalance: openings[id] ?? '0',
              closingBalance: '0',
              hasEarlier: earlier[id] ?? Number(openings[id] ?? '0') !== 0,
              entries: supplierLedgers[id] ?? [],
            },
        isPlaceholderData: ledgerState.placeholder,
        isLoading: ledgerState.isLoading,
        isError: ledgerState.isError,
        refetch: vi.fn(),
      };
    },
    usePayables: (stationId: string | null) => ({
      data: stationId && !payables.failed ? payables.list : undefined,
      isLoading: false,
      isError: payables.failed,
    }),
    useSupplierPayable: (stationId: string | null, id: string) => ({
      data: stationId && !payables.failed ? payables.bySupplier[id] : undefined,
      isLoading: false,
      isError: payables.failed,
    }),
    useCustomerStatement: (id: string, range: { from: string; to: string }) => {
      statementCalls.push({ id, ...range });
      return {
        data: ledgerState.isLoading
          ? undefined
          : {
              periodOpeningBalance: openings[id] ?? '0',
              closingBalance: '0',
              hasEarlier: earlier[id] ?? Number(openings[id] ?? '0') !== 0,
              entries: ledgers[id] ?? [],
            },
        isPlaceholderData: ledgerState.placeholder,
        isLoading: ledgerState.isLoading,
        isError: ledgerState.isError,
        refetch: vi.fn(),
      };
    },
    useReceivables: (stationId: string | null) => ({
      data: stationId && !receivables.failed ? receivables.list : undefined,
      isLoading: false,
      isError: receivables.failed,
    }),
    useCustomerReceivable: (stationId: string | null, id: string) => ({
      data: stationId && !receivables.failed ? receivables.byCustomer[id] : undefined,
      isLoading: false,
      isError: receivables.failed,
    }),
  };
});

const { MoneyScreen } = await import('./MoneyScreen.js');
const { SupplierPage } = await import('./money/SupplierPage.js');
const { NavProvider, useNav } = await import('../shell/nav.js');
const { stackOf } = await import('../shell/navStack.js');
const { ShellContext } = await import('../shell/context.js');

const shell = {
  station: null,
  stationName: 'Station',
  userName: 'Asha',
  role: 'Owner' as const,
  openAccount: () => {},
};

const holder = { nav: null as unknown as ReturnType<typeof useNav> };
const Probe: React.FC = () => {
  const n = useNav();
  useLayoutEffect(() => {
    holder.nav = n;
  });
  return null;
};

/** The Money root, plus whatever page is on top of its stack (the shell does this with Panes). */
type StageProps = { renderSupplierPage?: (s: any) => React.ReactNode; station?: any };
const Stage: React.FC<StageProps> = (props) => {
  const n = useNav();
  const stack = stackOf({ active: n.active, stacks: n.stacks, visited: [...n.visited] }, 'money');
  const top = stack[stack.length - 1];
  return top ? <>{top.element}</> : <MoneyScreen {...props} />;
};

const STATION = {
  id: 'st-1',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
};
const mount = (props: StageProps = {}) =>
  render(
    <ShellContext.Provider value={shell}>
      <NavProvider tabs={['money']}>
        <Probe />
        <Stage {...props} />
      </NavProvider>
    </ShellContext.Provider>,
  );

const cust = (over: Record<string, unknown>) => ({
  id: String(over.name),
  customerType: 'Fleet',
  fleetCode: null,
  phone: null,
  creditLimit: null,
  currentBalance: 0,
  ...over,
});

const row = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

beforeEach(() => {
  // 10:00 IST on 9 Oct 2026: the statement window opens on 1 May.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T10:00:00+05:30'));
  customers.length = 0;
  suppliers.length = 0;
  for (const k of Object.keys(ledgers)) delete ledgers[k];
  for (const k of Object.keys(earlier)) delete earlier[k];
  for (const k of Object.keys(supplierLedgers)) delete supplierLedgers[k];
  for (const k of Object.keys(openings)) delete openings[k];
  receivables.list = undefined;
  receivables.byCustomer = {};
  receivables.failed = false;
  statementCalls.length = 0;
  supplierStatementCalls.length = 0;
  payables.list = undefined;
  payables.bySupplier = {};
  payables.failed = false;
  ledgerState.isLoading = false;
  ledgerState.isError = false;
  ledgerState.placeholder = false;
  customers.push(
    cust({ name: 'Calicut Cabs', creditLimit: '100000', currentBalance: '61400' }),
    cust({
      name: 'KTC Logistics',
      creditLimit: '200000',
      currentBalance: '214600',
      phone: '+91 98470 12345',
      fleetCode: 'FLT-014',
    }),
    cust({ name: 'Malabar Travels', creditLimit: '150000', currentBalance: '128900' }),
    cust({ name: 'Sree Transports', creditLimit: '200000', currentBalance: '84300' }),
    cust({
      name: 'Govt Hospital',
      customerType: 'Credit',
      creditLimit: '100000',
      currentBalance: '96200',
    }),
    cust({ name: 'Ravi Autos', currentBalance: '5000' }),
    cust({ name: 'Settled Sam', currentBalance: '0' }),
    cust({ name: 'Prepaid Pat', currentBalance: '-2500' }),
  );
  suppliers.push(
    {
      id: 's1',
      name: 'HPCL Kozhikode Depot',
      phone: '0495 1',
      metadata: { tradeName: 'HPCL' },
      currentBalance: '1043200',
    },
    { id: 's2', name: 'Gulf Oil Lubricants', phone: null, metadata: null, currentBalance: '38400' },
    { id: 's3', name: 'Square Deal', currentBalance: '0' },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const AGING = { d0_7: 287000, d8_30: 211000, d30plus: 184000 };
const receivableRow = (customerId: string, balance: number, days: number | null) => ({
  customerId,
  balance,
  oldestUnpaidDate: days === null ? null : '2026-09-21',
  oldestUnpaidDays: days,
  aging: { d0_7: balance, d8_30: 0, d30plus: 0 },
});

describe('To collect with the receivables summary', () => {
  const summary = () => ({
    total: 590400,
    customerCount: 6,
    aging: AGING,
    customers: [
      receivableRow('KTC Logistics', 214600, 32),
      receivableRow('Malabar Travels', 128900, 9),
      receivableRow('Calicut Cabs', 61400, 3),
      receivableRow('Sree Transports', 84300, 0),
    ],
  });

  it('shows the aging split in the hero', () => {
    receivables.list = summary();
    mount({ station: STATION });
    const split = screen.getByTestId('aging-split');
    expect(within(split).getByText('₹2.87L')).toBeTruthy();
    expect(within(split).getByText('0–7 days')).toBeTruthy();
    expect(within(split).getByText('₹2.11L')).toBeTruthy();
    expect(within(split).getByText('8–30 days')).toBeTruthy();
    expect(within(split).getByText('₹1.84L')).toBeTruthy();
    expect(within(split).getByText('30+ days')).toBeTruthy();
    // Sits inside the hero, under the total.
    expect(screen.getByText('Receivables · 6 customers').closest('section')!.contains(split)).toBe(
      true,
    );
  });

  it('sizes the bar by each bucket’s share of what is owed', () => {
    receivables.list = summary();
    mount({ station: STATION });
    const flex = (key: string) =>
      (screen.getByTestId('aging-split').querySelector(`[data-segment="${key}"]`) as HTMLElement)
        .style.flexGrow;
    // 287 : 211 : 184 of 682
    expect(Number(flex('d0_7'))).toBeCloseTo((287 / 682) * 100, 1);
    expect(Number(flex('d30plus'))).toBeCloseTo((184 / 682) * 100, 1);
  });

  it('says how long each customer’s oldest debt has waited, coloured by its bucket', () => {
    receivables.list = summary();
    mount({ station: STATION });
    const tone = (name: string) =>
      within(row(name))
        .getByText(/^Oldest/)
        .getAttribute('data-tone');
    expect(within(row('KTC Logistics')).getByText('Oldest 32 days')).toBeTruthy();
    expect(tone('KTC Logistics')).toBe('bad');
    expect(within(row('Malabar Travels')).getByText('Oldest 9 days')).toBeTruthy();
    expect(tone('Malabar Travels')).toBe('warn');
    expect(tone('Calicut Cabs')).toBe('muted');
    expect(within(row('Sree Transports')).getByText('Oldest today')).toBeTruthy();
    expect(row('KTC Logistics').getAttribute('aria-label')).toBe(
      'KTC Logistics, ₹2,14,600.00 owed, over limit, oldest 32 days',
    );
  });

  it('leaves a customer the summary does not know without a caption (hidden, not zero)', () => {
    receivables.list = summary();
    mount({ station: STATION });
    // Govt Hospital owes money but is not in the summary rows.
    expect(within(row('Govt Hospital')).queryByText(/Oldest/)).toBeNull();
    expect(row('Govt Hospital').getAttribute('aria-label')).not.toMatch(/oldest/);
  });

  it('shows plain rows and no split until the summary arrives, without a station, or when it fails', () => {
    mount({ station: STATION });
    expect(screen.queryByTestId('aging-split')).toBeNull();
    expect(screen.queryByText(/Oldest/)).toBeNull();
    cleanup();

    receivables.list = summary();
    mount();
    expect(screen.queryByTestId('aging-split')).toBeNull();
    cleanup();

    receivables.failed = true;
    mount({ station: STATION });
    expect(screen.queryByTestId('aging-split')).toBeNull();
    expect(screen.getByText('Receivables · 6 customers')).toBeTruthy();
    expect(screen.getByText('₹5,90,400.00')).toBeTruthy();
  });

  it('draws no split when the summary says nothing is owed', () => {
    receivables.list = {
      total: 0,
      customerCount: 0,
      aging: { d0_7: 0, d8_30: 0, d30plus: 0 },
      customers: [],
    };
    mount({ station: STATION });
    expect(screen.queryByTestId('aging-split')).toBeNull();
  });
});

describe('To collect', () => {
  it('shows the receivable total and customer count, largest balance first', () => {
    mount();
    // 61400+214600+128900+84300+96200+5000 (advances and settled do not count)
    expect(screen.getByText('Receivables · 6 customers')).toBeTruthy();
    expect(screen.getByText('₹5,90,400.00')).toBeTruthy();
    const names = within(screen.getByText('Highest balances').parentElement!.parentElement!)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names[0]).toContain('KTC Logistics');
    expect(names[1]).toContain('Malabar Travels');
  });

  it('lists five customers, then all of those who owe on "See all"', () => {
    mount();
    expect(screen.queryByText('Ravi Autos')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'See all 6 customers' }));
    expect(screen.getByText('Ravi Autos')).toBeTruthy();
    expect(screen.queryByText('Settled Sam')).toBeNull();
    expect(screen.queryByRole('button', { name: /See all/ })).toBeNull();
  });

  it('searches by name across everyone, including settled and advance customers', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'settled' } });
    expect(screen.getByText('Settled Sam')).toBeTruthy();
    expect(screen.queryByText('KTC Logistics')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'zzz' } });
    expect(screen.getByText('No customers match “zzz”.')).toBeTruthy();
  });

  it('colours the limit bar by usage and the balance red only over the limit', () => {
    mount();
    // The row's bar is decorative (aria-hidden): the button's label carries the meaning.
    const bar = (name: string) => row(name).querySelector('[data-tone]')!;
    expect(bar('Calicut Cabs').getAttribute('data-tone')).toBe('accent'); // 61%
    expect(bar('Malabar Travels').getAttribute('data-tone')).toBe('warn'); // 86%
    expect(bar('KTC Logistics').getAttribute('data-tone')).toBe('bad'); // 107%
    expect(within(row('KTC Logistics')).getByText('₹2,14,600.00').className).toContain(
      'text-bad-fg',
    );
    expect(within(row('Malabar Travels')).getByText('₹1,28,900.00').className).not.toContain(
      'text-bad-fg',
    );
    // 107% fills the bar to 100%, not past it
    expect((bar('KTC Logistics').firstElementChild as HTMLElement).style.width).toBe('100%');
  });

  it('labels each row for assistive tech and hides the bar inside the button', () => {
    mount();
    expect(row('KTC Logistics').getAttribute('aria-label')).toBe(
      'KTC Logistics, ₹2,14,600.00 owed, over limit',
    );
    expect(row('Malabar Travels').getAttribute('aria-label')).toBe(
      'Malabar Travels, ₹1,28,900.00 owed, near limit',
    );
    expect(row('Calicut Cabs').getAttribute('aria-label')).toBe('Calicut Cabs, ₹61,400.00 owed');
    for (const b of screen.getAllByRole('button').filter((b) => b.querySelector('[data-tone]'))) {
      expect(within(b).queryByRole('progressbar')).toBeNull();
      expect(b.querySelector('[data-tone]')!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('has no bar for a customer without a credit limit', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'See all 6 customers' }));
    expect(row('Ravi Autos').querySelector('[data-tone]')).toBeNull();
  });

  it('describes a row as type and limit', () => {
    mount();
    expect(within(row('KTC Logistics')).getByText('Fleet · limit ₹2L')).toBeTruthy();
    expect(within(row('Govt Hospital')).getByText('Credit · limit ₹1L')).toBeTruthy();
  });
});

describe('To pay', () => {
  const toPay = () => fireEvent.click(screen.getByRole('radio', { name: 'To pay' }));

  it('shows the payable total and supplier count, with no due-date text', () => {
    mount();
    toPay();
    expect(screen.getByText('Payables · 2 suppliers')).toBeTruthy();
    expect(screen.getByText('₹10,81,600.00')).toBeTruthy();
    expect(screen.getByText('HPCL Kozhikode Depot')).toBeTruthy();
    expect(screen.queryByText('Square Deal')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bdue\b|overdue|since \d/i);
  });

  it('searches suppliers, and clears the search when switching lists', () => {
    mount();
    toPay();
    fireEvent.change(screen.getByLabelText('Search suppliers'), { target: { value: 'square' } });
    expect(screen.getByText('Square Deal')).toBeTruthy();
    expect(screen.queryByText('HPCL Kozhikode Depot')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'To collect' }));
    expect((screen.getByLabelText('Search customers') as HTMLInputElement).value).toBe('');
  });

  it('keeps supplier rows plain until the Supplier page is wired in', () => {
    mount();
    toPay();
    expect(screen.queryByRole('button', { name: /HPCL/ })).toBeNull();
  });

  it('opens the supplier page it is given', () => {
    mount({ renderSupplierPage: (s) => <p>Supplier page for {s.name}</p> });
    toPay();
    fireEvent.click(screen.getByRole('button', { name: /HPCL/ }));
    expect(screen.getByText('Supplier page for HPCL Kozhikode Depot')).toBeTruthy();
  });
});

describe('To pay with the payables summary', () => {
  const toPay = () => fireEvent.click(screen.getByRole('radio', { name: 'To pay' }));
  const summary = () => ({
    total: 1081600,
    supplierCount: 2,
    month: { purchased: 2140000, paid: 1020000, purchasedMonth: '2026-10', paidMonth: '2026-10' },
    suppliers: [
      {
        supplierId: 's1',
        balance: 1043200,
        unpaidCount: 1,
        oldestUnpaidDate: '2026-10-09',
        oldestUnpaidDays: 0,
      },
      {
        supplierId: 's2',
        balance: 38400,
        unpaidCount: 2,
        oldestUnpaidDate: '2026-09-29',
        oldestUnpaidDays: 10,
      },
    ],
  });

  it('shows paid vs purchased this month in the hero', () => {
    payables.list = summary();
    mount({ station: STATION });
    toPay();
    const hero = screen.getByText('Payables · 2 suppliers').closest('section') as HTMLElement;
    expect(within(hero).getByText('₹10,81,600.00')).toBeTruthy();
    expect(within(hero).getByText('Paid this month').nextSibling?.textContent).toBe('₹10.2L');
    expect(within(hero).getByText('Purchased this month').nextSibling?.textContent).toBe('₹21.4L');
  });

  it('says which month each figure covers only when the two differ', () => {
    payables.list = summary();
    mount({ station: STATION });
    toPay();
    expect(document.body.textContent).not.toMatch(/Business Date\)/);
    cleanup();

    payables.list = {
      ...summary(),
      month: { ...summary().month, purchasedMonth: '2026-10', paidMonth: '2026-11' },
    };
    mount({ station: STATION });
    toPay();
    expect(
      screen.getByText(
        'Purchases: October 2026 (Business Date) · Payments: November 2026 (Entry Date)',
      ),
    ).toBeTruthy();
  });

  it('says on each row how many are unpaid and since when', () => {
    payables.list = summary();
    mount({ station: STATION, renderSupplierPage: () => null });
    toPay();
    const hpcl = screen.getByRole('button', { name: /HPCL/ });
    expect(hpcl.textContent).toContain('HPCL · 1 unpaid');
    expect(hpcl.textContent).toContain('since 9 Oct');
    const gulf = screen.getByRole('button', { name: /Gulf/ });
    expect(gulf.textContent).toContain('2 unpaid');
    expect(gulf.textContent).toContain('since 29 Sep');
    // suppliers have no payment terms: never a due date
    expect(document.body.textContent).not.toMatch(/\bdue\b|overdue/i);
  });

  it('leaves a supplier the summary does not know without the caption (hidden, not zero)', () => {
    payables.list = { ...summary(), suppliers: [summary().suppliers[0]] };
    mount({ station: STATION, renderSupplierPage: () => null });
    toPay();
    const gulf = screen.getByRole('button', { name: /Gulf/ });
    expect(gulf.textContent).not.toMatch(/unpaid|since/);
  });

  it('shows plain rows and no month figures until the summary arrives, without a station, or when it fails', () => {
    mount({ station: STATION });
    toPay();
    expect(document.body.textContent).not.toMatch(/Paid this month|unpaid|since \d/);
    cleanup();

    payables.list = summary();
    mount();
    toPay();
    expect(document.body.textContent).not.toMatch(/Paid this month|unpaid|since \d/);
    cleanup();

    payables.failed = true;
    mount({ station: STATION });
    toPay();
    expect(document.body.textContent).not.toMatch(/Paid this month|unpaid|since \d/);
    expect(screen.getByText('₹10,81,600.00')).toBeTruthy();
  });
});

describe('Customer page', () => {
  const open = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
  };
  const balance = () => screen.getByRole('region', { name: 'Balance' });

  it('opens from a row with the header, call button and over-limit card', () => {
    mount();
    open('KTC Logistics');
    expect(screen.getByRole('heading', { name: 'KTC Logistics' })).toBeTruthy();
    expect(screen.getByText('Fleet · FLT-014 · +91 98470 12345')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Call KTC Logistics' }).getAttribute('href')).toBe(
      'tel:+919847012345',
    );
    expect(balance().getAttribute('data-state')).toBe('over');
    expect(within(balance()).getByText('Owes you')).toBeTruthy();
    expect(within(balance()).getByText('Over limit')).toBeTruthy();
    expect(within(balance()).getByText('Limit ₹2,00,000.00')).toBeTruthy();
    expect(within(balance()).getByText('+₹14,600.00 over · 107%')).toBeTruthy();
  });

  it('hides the call button when the customer has no phone', () => {
    mount();
    open('Calicut Cabs');
    expect(screen.getByRole('heading', { name: 'Calicut Cabs' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Call/ })).toBeNull();
  });

  it('at 79.6% of the limit the bar and the state agree: not near', () => {
    customers.push(cust({ name: 'Edge Ed', creditLimit: '100000', currentBalance: '79600' }));
    mount();
    fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'edge' } });
    expect(row('Edge Ed').querySelector('[data-tone]')!.getAttribute('data-tone')).toBe('accent');
    expect(row('Edge Ed').getAttribute('aria-label')).not.toMatch(/near limit/);
    open('Edge Ed');
    expect(balance().getAttribute('data-state')).toBe('under');
    expect(within(balance()).queryByText('Near limit')).toBeNull();
    expect(within(balance()).getByText('₹20,400.00 left · 79% used')).toBeTruthy();
  });

  it('shows near-limit and under-limit balances with the room left', () => {
    mount();
    open('Malabar Travels');
    expect(balance().getAttribute('data-state')).toBe('near');
    expect(within(balance()).getByText('Near limit')).toBeTruthy();
    expect(within(balance()).getByText('₹21,100.00 left · 86% used')).toBeTruthy();
  });

  it('shows an under-limit balance without a badge', () => {
    mount();
    open('Calicut Cabs');
    expect(balance().getAttribute('data-state')).toBe('under');
    expect(within(balance()).queryByText(/^(Near|Over) limit$/)).toBeNull();
    expect(within(balance()).getByText('₹38,600.00 left · 61% used')).toBeTruthy();
  });

  it('says so when no credit limit is set', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'See all 6 customers' }));
    open('Ravi Autos');
    expect(within(balance()).getByText('No credit limit set.')).toBeTruthy();
    expect(within(balance()).queryByRole('progressbar')).toBeNull();
  });

  it('shows an advance and a settled customer', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'pat' } });
    open('Prepaid Pat');
    expect(balance().getAttribute('data-state')).toBe('advance');
    expect(within(balance()).getByText('Advance')).toBeTruthy();
    expect(within(balance()).getByText('₹2,500.00')).toBeTruthy();
    cleanup();

    mount();
    fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'sam' } });
    open('Settled Sam');
    expect(balance().getAttribute('data-state')).toBe('settled');
    expect(within(balance()).getByText('Settled')).toBeTruthy();
    expect(within(balance()).getByText('Nothing due.')).toBeTruthy();
  });

  it('has no action bar yet and hides the figures that need the receivables summary', () => {
    mount();
    open('KTC Logistics');
    expect(screen.queryByRole('button', { name: /Share|Download/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/Last payment|Usually pays|0–7 days/);
  });

  it('goes back to the list', async () => {
    mount();
    open('KTC Logistics');
    await act(async () => {
      holder.nav.back();
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(screen.getByText('Receivables · 6 customers')).toBeTruthy();
  });

  describe('receivables summary', () => {
    const ktc = () => ({
      customerId: 'KTC Logistics',
      balance: 214600,
      oldestUnpaidDate: '2026-09-21',
      oldestUnpaidDays: 18,
      aging: { d0_7: 86400, d8_30: 78000, d30plus: 50200 },
      settlementCycle: 'OPEN',
      lastPayment: { amount: 40000, entryDate: '2026-09-18', method: 'UPI', daysAgo: 21 },
      usuallyPaysInDays: 24,
      month: { credit: 81900, slips: 23, litres: 812, paid: 0 },
      vehicles: [
        {
          vehicleId: 'v1',
          registration: 'KL-11-AB-4521',
          type: 'Truck',
          amount: 52300,
          litres: 500,
        },
        {
          vehicleId: 'v2',
          registration: 'KL-11-AC-7710',
          type: 'Truck',
          amount: 21400,
          litres: 200,
        },
        { vehicleId: 'v3', registration: 'KL-11-BB-0912', type: 'Bus', amount: 8200, litres: 80 },
      ],
    });
    const openKtc = (extra: Record<string, unknown> = {}) => {
      receivables.byCustomer['KTC Logistics'] = { ...ktc(), ...extra };
      mount({ station: STATION });
      open('KTC Logistics');
    };
    const tile = (label: string) => screen.getByText(label).closest('div')!.parentElement!;

    it('shows the aging split inside the balance card', () => {
      openKtc();
      const split = within(balance()).getByTestId('aging-split');
      expect(within(split).getByText('₹86,400')).toBeTruthy();
      expect(within(split).getByText('0–7 days')).toBeTruthy();
      expect(within(split).getByText('₹78,000')).toBeTruthy();
      expect(within(split).getByText('₹50,200')).toBeTruthy();
      expect(within(split).getByText('30+ days')).toBeTruthy();
    });

    it('shows last payment, usually pays in, credit and paid this month', () => {
      openKtc();
      const behaviour = within(screen.getByRole('group', { name: 'Payment behaviour' }));
      expect(behaviour.getByText('₹40,000')).toBeTruthy();
      expect(behaviour.getByText('18 Sep · 21 days ago')).toBeTruthy();
      expect(behaviour.getByText('24 days')).toBeTruthy();
      expect(behaviour.getByText('avg, last 6 settled sales')).toBeTruthy();
      expect(behaviour.getByText('₹81,900')).toBeTruthy();
      expect(behaviour.getByText('23 slips · 812 L')).toBeTruthy();
      expect(behaviour.getByText('Paid this month')).toBeTruthy();
      expect(behaviour.getByText('Settles: open account')).toBeTruthy();
      expect(tile('Last payment')).toBeTruthy();
    });

    it('hides the tiles the API has no data for, instead of showing zeros', () => {
      openKtc({ lastPayment: null, usuallyPaysInDays: null });
      const behaviour = within(screen.getByRole('group', { name: 'Payment behaviour' }));
      expect(behaviour.queryByText('Last payment')).toBeNull();
      expect(behaviour.queryByText('Usually pays in')).toBeNull();
      expect(behaviour.getByText('Credit this month')).toBeTruthy();
      expect(behaviour.getByText('Paid this month')).toBeTruthy();
    });

    it('lists Vehicles · this month with bars sized against the biggest', () => {
      openKtc();
      const vehicles = within(screen.getByRole('region', { name: 'Vehicles this month' }));
      expect(vehicles.getByText('3 vehicles')).toBeTruthy();
      const items = vehicles.getAllByRole('listitem');
      expect(items[0].textContent).toContain('KL-11-AB-4521');
      expect(items[0].textContent).toContain('Truck');
      expect(items[0].textContent).toContain('₹52,300');
      expect(items[2].textContent).toContain('Bus');
      const widths = vehicles
        .getAllByTestId('vehicle-bar')
        .map((b) => (b as HTMLElement).style.width);
      expect(widths[0]).toBe('100%');
      expect(parseFloat(widths[1])).toBeCloseTo((21400 / 52300) * 100, 1);
      expect(parseFloat(widths[2])).toBeCloseTo((8200 / 52300) * 100, 1);
    });

    it('has no vehicles section for a customer with none this month', () => {
      openKtc({ vehicles: [] });
      expect(screen.queryByRole('region', { name: 'Vehicles this month' })).toBeNull();
      expect(screen.queryByText(/Vehicles ·/)).toBeNull();
    });

    it('words a customer who settles by end of day', () => {
      openKtc({ settlementCycle: 'EOD' });
      expect(screen.getByText('Settles: end of day')).toBeTruthy();
    });

    it('leaves the balance card and the statement standing when the summary fails', () => {
      receivables.failed = true;
      ledgers['KTC Logistics'] = [];
      mount({ station: STATION });
      open('KTC Logistics');
      expect(within(balance()).getByText('Owes you')).toBeTruthy();
      expect(screen.queryByTestId('aging-split')).toBeNull();
      expect(screen.queryByRole('group', { name: 'Payment behaviour' })).toBeNull();
      expect(screen.getByText('Statement')).toBeTruthy();
    });

    it('shows no aging for a settled customer, even with a summary', () => {
      receivables.byCustomer['Settled Sam'] = {
        ...ktc(),
        customerId: 'Settled Sam',
        balance: 0,
        aging: { d0_7: 0, d8_30: 0, d30plus: 0 },
      };
      mount({ station: STATION });
      fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'sam' } });
      open('Settled Sam');
      expect(within(balance()).queryByTestId('aging-split')).toBeNull();
    });
  });

  describe('enriched statement', () => {
    const SALE = {
      id: 's1',
      transactionType: 'Credit Sale',
      amount: '10750',
      businessDate: '2026-10-09',
      createdAt: '2026-10-09T10:00:00Z',
      shiftId: 'sh1',
      shiftBusinessDate: '2026-10-09',
      shiftSequence: 1,
      productName: 'Diesel',
      quantity: 120,
      unit: 'L',
      vehicleRegistration: 'KL-11-AB-4521',
    };
    const PAYMENT = {
      id: 'c1',
      transactionType: 'Collection',
      amount: '4000',
      businessDate: '2026-09-18',
      createdAt: '2026-09-18T10:00:00Z',
      method: 'UPI',
      reference: 'COL-000042',
      fundingAccountName: 'SBI',
    };

    it('shows the Shift Label, product, litres and Vehicle on a Credit Sale, method and reference on a Collection', () => {
      customers.push(cust({ name: 'Ledger Lou', currentBalance: '6750', creditLimit: '100000' }));
      openings['Ledger Lou'] = '0';
      ledgers['Ledger Lou'] = [PAYMENT, SALE];
      // 10750 - 4000
      mount({ station: STATION });
      fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'lou' } });
      open('Ledger Lou');
      const oct = within(screen.getByRole('region', { name: 'October 2026' }));
      expect(oct.getByText('9 Oct · Shift 20261009-1')).toBeTruthy();
      expect(oct.getByText('120 L Diesel · KL-11-AB-4521')).toBeTruthy();
      const sep = within(screen.getByRole('region', { name: 'September 2026' }));
      expect(sep.getByText('18 Sep · UPI · Ref COL-000042')).toBeTruthy();
    });

    it('asks for the last 6 months and carries the earlier balance in', () => {
      customers.push(cust({ name: 'Ledger Lou', currentBalance: '11750', creditLimit: '100000' }));
      openings['Ledger Lou'] = '1000';
      ledgers['Ledger Lou'] = [SALE];
      mount({ station: STATION });
      fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'lou' } });
      open('Ledger Lou');
      expect(statementCalls.at(-1)).toMatchObject({ id: 'Ledger Lou', from: '2026-05-01' });
      expect(screen.getByText('Balance brought forward from before 1 May 2026')).toBeTruthy();
      // The row's running balance starts from the opening balance: 1000 + 10750.
      expect(document.body.textContent).toContain('Bal ₹11,750.00');
    });

    it('widens the window by 6 months from "Earlier months" when something is owed from before', () => {
      customers.push(cust({ name: 'Ledger Lou', currentBalance: '11750', creditLimit: '100000' }));
      openings['Ledger Lou'] = '1000';
      ledgers['Ledger Lou'] = [SALE];
      mount({ station: STATION });
      fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'lou' } });
      open('Ledger Lou');
      fireEvent.click(screen.getByRole('button', { name: 'Earlier months' }));
      expect(statementCalls.at(-1)).toMatchObject({ id: 'Ledger Lou', from: '2025-11-01' });
    });

    it('says nothing is owed before the window, and offers no earlier months, when nothing is dated before it', () => {
      customers.push(cust({ name: 'Ledger Lou', currentBalance: '10750', creditLimit: '100000' }));
      openings['Ledger Lou'] = '0';
      ledgers['Ledger Lou'] = [SALE];
      mount({ station: STATION });
      fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'lou' } });
      open('Ledger Lou');
      expect(screen.getByText('Nothing owed before 1 May 2026.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Earlier months' })).toBeNull();
    });

    it('offers earlier months to a customer who was settled before the window', () => {
      customers.push(cust({ name: 'Ledger Lou', currentBalance: '10750', creditLimit: '100000' }));
      openings['Ledger Lou'] = '0';
      earlier['Ledger Lou'] = true; // older entries that net to zero
      ledgers['Ledger Lou'] = [SALE];
      mount({ station: STATION });
      fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'lou' } });
      open('Ledger Lou');
      expect(screen.getByText('Nothing owed before 1 May 2026.')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Earlier months' }));
      expect(statementCalls.at(-1)).toMatchObject({ id: 'Ledger Lou', from: '2025-11-01' });
    });

    it('keeps the rows on screen while earlier months load', () => {
      customers.push(cust({ name: 'Ledger Lou', currentBalance: '11750', creditLimit: '100000' }));
      openings['Ledger Lou'] = '1000';
      ledgers['Ledger Lou'] = [SALE];
      ledgerState.placeholder = true;
      mount({ station: STATION });
      fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'lou' } });
      open('Ledger Lou');
      expect(screen.queryByText('Loading statement…')).toBeNull();
      expect(screen.getByText('Credit Sale')).toBeTruthy();
      const more = screen.getByRole('button', { name: 'Loading earlier months…' });
      expect((more as HTMLButtonElement).disabled).toBe(true);
      // The footer names the window it was fetched for: it waits for the wider one.
      expect(screen.queryByText(/Balance brought forward/)).toBeNull();
    });

    it('shows the balance brought forward when nothing happened in the window', () => {
      customers.push(cust({ name: 'Ledger Lou', currentBalance: '1000', creditLimit: '100000' }));
      openings['Ledger Lou'] = '1000';
      ledgers['Ledger Lou'] = [];
      mount({ station: STATION });
      fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'lou' } });
      open('Ledger Lou');
      expect(screen.getByText('Balance brought forward from before 1 May 2026')).toBeTruthy();
      expect(screen.queryByText(/No transactions/)).toBeNull();
    });
  });

  describe('statement', () => {
    const LEDGER = [
      {
        id: 'a',
        transactionType: 'Opening Balance',
        amount: '5000',
        businessDate: '2026-08-31',
        createdAt: '2026-08-31T10:00:00Z',
      },
      {
        id: 'b',
        transactionType: 'Credit Sale',
        amount: '5375',
        businessDate: '2026-09-16',
        createdAt: '2026-09-16T10:00:00Z',
      },
      {
        id: 'c',
        transactionType: 'Collection',
        amount: '4000',
        notes: 'UPI',
        businessDate: '2026-09-18',
        createdAt: '2026-09-18T10:00:00Z',
      },
      {
        id: 'd',
        transactionType: 'Credit Sale',
        amount: '10750',
        businessDate: '2026-10-07',
        createdAt: '2026-10-07T10:00:00Z',
      },
      {
        id: 'e',
        transactionType: 'Adjustment',
        amount: '100',
        businessDate: '2026-10-09',
        createdAt: '2026-10-09T10:00:00Z',
      },
    ];

    it('shows a running balance for a customer with a single credit sale', () => {
      ledgers['Ravi Autos'] = [
        {
          id: 'a',
          transactionType: 'Credit Sale',
          amount: '5000',
          businessDate: '2026-09-16',
          createdAt: '2026-09-16T10:00:00Z',
        },
      ];
      mount();
      fireEvent.click(screen.getByRole('button', { name: 'See all 6 customers' }));
      open('Ravi Autos');
      const m = screen.getByRole('region', { name: 'September 2026' });
      expect(within(m).getByText('Credit Sale')).toBeTruthy();
      expect(within(m).getByText('Bal ₹5,000.00')).toBeTruthy();
    });

    it('lists the four ledger types with their running balances, newest first', () => {
      customers.push(cust({ name: 'Ledger Lou', currentBalance: '17225', creditLimit: '100000' }));
      ledgers['Ledger Lou'] = LEDGER;
      mount();
      fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'lou' } });
      open('Ledger Lou');

      const months = screen
        .getAllByRole('region')
        .filter((r) => r.getAttribute('aria-label') !== 'Balance');
      expect(months.map((r) => r.getAttribute('aria-label'))).toEqual([
        'October 2026',
        'September 2026',
        'August 2026',
      ]);
      const oct = within(months[0]);
      const items = oct.getAllByRole('listitem').map((li) => li.textContent);
      expect(items[0]).toContain('Adjustment');
      expect(items[0]).toContain('+₹100.00');
      expect(items[0]).toContain('Bal ₹17,225.00');
      expect(items[1]).toContain('Credit Sale');
      expect(items[1]).toContain('Bal ₹17,125.00');
      const sep = within(months[1])
        .getAllByRole('listitem')
        .map((li) => li.textContent);
      expect(sep[0]).toContain('Payment received');
      expect(sep[0]).toContain('−₹4,000.00');
      expect(sep[0]).toContain('18 Sep · UPI');
      expect(sep[0]).toContain('Bal ₹6,375.00');
      expect(within(months[2]).getByText('Opening balance')).toBeTruthy();
      expect(screen.getByText(/Showing 5 of 5 entries/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    });

    it('does not show a running balance that disagrees with the server balance', () => {
      // Server says Ledger Lou owes ₹20,000; the ledger rows only add up to ₹17,225.
      customers.push(cust({ name: 'Ledger Lou', currentBalance: '20000', creditLimit: '100000' }));
      ledgers['Ledger Lou'] = LEDGER;
      mount();
      fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'lou' } });
      open('Ledger Lou');

      // The balance card is the server figure.
      expect(within(balance()).getByText('₹20,000.00')).toBeTruthy();
      expect(screen.getByRole('note').textContent).toMatch(/Partial statement/);
      // Rows keep their amounts but no running balance.
      expect(screen.getAllByRole('listitem')).toHaveLength(5);
      expect(document.body.textContent).toContain('+₹100.00');
      expect(document.body.textContent).not.toMatch(/Bal ₹/);
    });

    it('shows no partial note when the ledger reconciles', () => {
      customers.push(cust({ name: 'Ledger Lou', currentBalance: '17225', creditLimit: '100000' }));
      ledgers['Ledger Lou'] = LEDGER;
      mount();
      fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'lou' } });
      open('Ledger Lou');
      expect(screen.queryByRole('note')).toBeNull();
    });

    it('pages with Load more', () => {
      customers.push(cust({ name: 'Ledger Lou', currentBalance: '45', creditLimit: '100000' }));
      ledgers['Ledger Lou'] = Array.from({ length: 45 }, (_, i) => ({
        id: `r${i}`,
        transactionType: 'Credit Sale',
        amount: '1',
        businessDate: '2026-10-01',
        createdAt: '2026-10-01T10:00:00Z',
      }));
      mount();
      fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'lou' } });
      open('Ledger Lou');
      expect(screen.getByText(/Showing 20 of 45 entries/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      expect(screen.getByText(/Showing 40 of 45 entries/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      expect(screen.getByText(/Showing 45 of 45 entries/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    });

    it('shows loading, empty and error states', () => {
      mount();
      ledgerState.isLoading = true;
      open('KTC Logistics');
      expect(screen.getByText('Loading statement…')).toBeTruthy();
      cleanup();

      ledgerState.isLoading = false;
      mount();
      fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'sam' } });
      open('Settled Sam');
      expect(screen.getByText(/No transactions since 1 May 2026/)).toBeTruthy();
      cleanup();

      mount();
      open('KTC Logistics');
      expect(screen.getByText('No statement entries to show for this balance.')).toBeTruthy();
      cleanup();

      ledgerState.isError = true;
      mount();
      open('KTC Logistics');
      expect(screen.getByText(/Couldn’t load the statement/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    });
  });
});

describe('Supplier page', () => {
  const mountSupplier = () =>
    mount({
      station: STATION,
      renderSupplierPage: (s) => <SupplierPage supplier={s} station={STATION as any} />,
    }) && fireEvent.click(screen.getByRole('radio', { name: 'To pay' }));
  const openSupplier = (name: string) => {
    mountSupplier();
    fireEvent.change(screen.getByLabelText('Search suppliers'), { target: { value: name } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
  };
  const balance = () => screen.getByRole('region', { name: 'Balance' });
  const sup = (over: Record<string, unknown>) => ({
    id: String(over.name),
    phone: null,
    metadata: null,
    currentBalance: 0,
    ...over,
  });

  it('opens from a To pay row with GSTIN, vendor code, call button and the amount owed', () => {
    suppliers.push(
      sup({
        name: 'Indus Fuels',
        phone: '0495 222 333',
        currentBalance: '25000',
        metadata: { gstin: '32AAACH1118R1Z5', vendorCode: 'V-014' },
      }),
    );
    openSupplier('Indus');
    expect(screen.getByRole('heading', { name: 'Indus Fuels' })).toBeTruthy();
    expect(screen.getByText('GSTIN 32AAACH1118R1Z5 · Code V-014')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Call Indus Fuels' }).getAttribute('href')).toBe(
      'tel:0495222333',
    );
    expect(balance().getAttribute('data-state')).toBe('owes');
    expect(within(balance()).getByText('You owe')).toBeTruthy();
    expect(within(balance()).getByText('₹25,000.00')).toBeTruthy();
    // no credit limit, no due dates
    expect(document.body.textContent).not.toMatch(/limit|overdue|due on|oldest/i);
  });

  it('omits GSTIN, vendor code and the call button when the supplier has none', () => {
    openSupplier('Gulf');
    expect(screen.getByRole('heading', { name: 'Gulf Oil Lubricants' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/GSTIN|Code /);
    expect(screen.queryByRole('link', { name: /Call/ })).toBeNull();
  });

  it('shows only the part that is present: GSTIN without a code, a code without GSTIN', () => {
    suppliers.push(
      sup({ name: 'Only Gst', currentBalance: 1, metadata: { gstin: '29ABCDE1234F1Z5' } }),
      sup({ name: 'Only Code', currentBalance: 1, metadata: { vendorCode: 'V-9' } }),
    );
    openSupplier('Only Gst');
    expect(screen.getByText('GSTIN 29ABCDE1234F1Z5')).toBeTruthy();
    cleanup();
    openSupplier('Only Code');
    expect(screen.getByText('Code V-9')).toBeTruthy();
  });

  it('shows an advance (negative balance) and a settled supplier', () => {
    suppliers.push(
      sup({ name: 'Prepaid Petro', currentBalance: '-16800' }),
      sup({ name: 'Even Oil', currentBalance: '0' }),
    );
    openSupplier('Prepaid');
    expect(balance().getAttribute('data-state')).toBe('advance');
    expect(within(balance()).getByText('Advance')).toBeTruthy();
    expect(within(balance()).getByText('₹16,800.00')).toBeTruthy();
    cleanup();

    openSupplier('Even');
    expect(balance().getAttribute('data-state')).toBe('settled');
    expect(within(balance()).getByText('Settled')).toBeTruthy();
    expect(within(balance()).getByText('₹0.00')).toBeTruthy();
    expect(within(balance()).getByText('Nothing due.')).toBeTruthy();
  });

  it('has no action bar yet and none of the payables-summary figures', () => {
    openSupplier('HPCL');
    expect(screen.queryByRole('button', { name: /Share|Download/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /Purchased this month|Paid this month|Purchases by product|Oldest unpaid/i,
    );
  });

  describe('payables summary', () => {
    const HPCL = {
      supplierId: 's1',
      balance: 1043200,
      unpaidCount: 1,
      oldestUnpaidDate: '2026-10-09',
      oldestUnpaidDays: 0,
      lastPayment: {
        amount: 980000,
        entryDate: '2026-10-06',
        method: 'BANK',
        fundingAccountName: 'SBI current a/c',
      },
      month: {
        purchased: 2072200,
        paid: 980000,
        purchasedMonth: '2026-10',
        paidMonth: '2026-10',
        purchaseCount: 2,
        quantity: 22000,
      },
      purchasesByProduct: [
        { productId: 'p1', name: 'HSD', unit: 'L', quantity: 12000, value: 1043200 },
        { productId: 'p2', name: 'MS', unit: 'L', quantity: 10000, value: 1029000 },
      ],
    };

    it('names the oldest unpaid Purchase under the balance', () => {
      payables.bySupplier.s1 = HPCL;
      openSupplier('HPCL');
      expect(within(balance()).getByText('1 unpaid purchase · oldest 9 Oct (today)')).toBeTruthy();
      // no due dates
      expect(document.body.textContent).not.toMatch(/overdue|due on|due in/i);
    });

    it('shows purchased vs paid this month with the litres and the last payment', () => {
      payables.bySupplier.s1 = HPCL;
      openSupplier('HPCL');
      const tiles = within(screen.getByRole('group', { name: 'This month' }));
      expect(tiles.getByText('Purchased this month')).toBeTruthy();
      expect(tiles.getByText('₹20.72L')).toBeTruthy();
      expect(tiles.getByText('2 purchases · 22,000 L')).toBeTruthy();
      expect(tiles.getByText('Paid this month')).toBeTruthy();
      expect(tiles.getByText('₹9.8L')).toBeTruthy();
      expect(tiles.getByText('Last: 6 Oct · Bank')).toBeTruthy();
    });

    it('says which month each tile covers only when they differ', () => {
      payables.bySupplier.s1 = HPCL;
      openSupplier('HPCL');
      expect(document.body.textContent).not.toMatch(/\(Business Date\)/);
      cleanup();

      payables.bySupplier.s1 = {
        ...HPCL,
        month: { ...HPCL.month, purchasedMonth: '2026-10', paidMonth: '2026-11' },
      };
      openSupplier('HPCL');
      expect(
        screen.getByText(
          'Purchases: October 2026 (Business Date) · Payments: November 2026 (Entry Date)',
        ),
      ).toBeTruthy();
    });

    it('lists purchases by product with quantity and value', () => {
      payables.bySupplier.s1 = HPCL;
      openSupplier('HPCL');
      const list = within(screen.getByRole('region', { name: 'Purchases by product this month' }));
      const items = list.getAllByRole('listitem').map((li) => li.textContent);
      expect(items[0]).toContain('HSD');
      expect(items[0]).toContain('12,000 L');
      expect(items[0]).toContain('₹10.43L');
      expect(items[1]).toContain('MS');
      expect(items[1]).toContain('10,000 L');
    });

    it('leaves out the product list when nothing was bought this month, and the oldest line when nothing is unpaid', () => {
      payables.bySupplier.s1 = {
        ...HPCL,
        unpaidCount: 0,
        oldestUnpaidDate: null,
        oldestUnpaidDays: null,
        lastPayment: null,
        month: {
          purchased: 0,
          paid: 0,
          purchasedMonth: '2026-10',
          paidMonth: '2026-10',
          purchaseCount: 0,
          quantity: 0,
        },
        purchasesByProduct: [],
      };
      openSupplier('HPCL');
      expect(screen.queryByRole('region', { name: 'Purchases by product this month' })).toBeNull();
      expect(document.body.textContent).not.toMatch(/unpaid purchase|oldest/);
      expect(screen.getByText('No payment yet')).toBeTruthy();
    });

    it('shows an advance as an advance, with no oldest-unpaid line', () => {
      suppliers.push(sup({ name: 'Prepaid Petro', currentBalance: '-16800' }));
      payables.bySupplier['Prepaid Petro'] = {
        ...HPCL,
        supplierId: 'Prepaid Petro',
        balance: -16800,
        unpaidCount: 0,
        oldestUnpaidDate: null,
        oldestUnpaidDays: null,
      };
      openSupplier('Prepaid');
      expect(balance().getAttribute('data-state')).toBe('advance');
      expect(document.body.textContent).not.toMatch(/unpaid purchase/);
    });

    it('keeps the balance and the statement standing when the summary fails or there is no station', () => {
      payables.failed = true;
      openSupplier('HPCL');
      expect(within(balance()).getByText('₹10,43,200.00')).toBeTruthy();
      expect(screen.queryByRole('group', { name: 'This month' })).toBeNull();
      expect(screen.getByText('Statement')).toBeTruthy();
    });
  });

  describe('enriched statement', () => {
    const PURCHASE = {
      id: 'p1',
      transactionType: 'Purchase',
      amount: '1043200',
      businessDate: '2026-10-09',
      createdAt: '2026-10-09T10:00:00Z',
      invoiceNumber: 'INV-55821',
      productName: 'HSD',
      quantity: 12000,
      unit: 'L',
      tankerNumber: null,
    };
    const PAYMENT = {
      id: 'y1',
      transactionType: 'Payment',
      amount: '980000',
      businessDate: '2026-10-06',
      createdAt: '2026-10-06T10:00:00Z',
      method: 'BANK',
      fundingAccountName: 'SBI current a/c',
    };

    it('shows the invoice, quantity and product on a Purchase, method and Funding Account on a Payment', () => {
      suppliers.push(sup({ name: 'Ledger Lal', currentBalance: '63200' }));
      supplierLedgers['Ledger Lal'] = [PAYMENT, PURCHASE];
      openSupplier('Ledger');
      const oct = within(screen.getByRole('region', { name: 'October 2026' }));
      expect(oct.getByText('Purchase · HSD')).toBeTruthy();
      expect(oct.getByText('9 Oct · INV-55821 · 12,000 L')).toBeTruthy();
      expect(oct.getByText('Payment made')).toBeTruthy();
      expect(oct.getByText('6 Oct · Bank')).toBeTruthy();
      expect(oct.getByText('From SBI current a/c')).toBeTruthy();
      // the tanker is only shown when one was recorded
      expect(document.body.textContent).not.toMatch(/Tanker/);
    });

    it('shows the tanker when one was recorded', () => {
      suppliers.push(sup({ name: 'Ledger Lal', currentBalance: '1043200' }));
      supplierLedgers['Ledger Lal'] = [{ ...PURCHASE, tankerNumber: 'KL-58-H-2210' }];
      openSupplier('Ledger');
      expect(screen.getByText('Tanker KL-58-H-2210')).toBeTruthy();
    });

    it('asks for the last 6 months and carries the earlier balance in (an advance reads signed)', () => {
      suppliers.push(sup({ name: 'Ledger Lal', currentBalance: '-1000' }));
      openings['Ledger Lal'] = '-1500';
      supplierLedgers['Ledger Lal'] = [{ ...PURCHASE, amount: '500' }];
      openSupplier('Ledger');
      expect(supplierStatementCalls.at(-1)).toEqual({
        id: 'Ledger Lal',
        from: '2026-05-01',
        to: '9999-12-31',
      });
      expect(screen.getByText('Balance brought forward from before 1 May 2026')).toBeTruthy();
      expect(screen.getByText('−₹1,500.00')).toBeTruthy();
      expect(screen.getByText('Bal −₹1,000.00')).toBeTruthy();
    });

    it('widens the window by 6 months on "Earlier months" and keeps the rows while it loads', () => {
      suppliers.push(sup({ name: 'Ledger Lal', currentBalance: '500' }));
      openings['Ledger Lal'] = '0';
      earlier['Ledger Lal'] = true;
      supplierLedgers['Ledger Lal'] = [{ ...PURCHASE, amount: '500' }];
      openSupplier('Ledger');
      fireEvent.click(screen.getByRole('button', { name: 'Earlier months' }));
      expect(supplierStatementCalls.at(-1)).toMatchObject({ from: '2025-11-01' });
      ledgerState.placeholder = true;
      cleanup();
      openSupplier('Ledger');
      expect(screen.getByRole('button', { name: 'Loading earlier months…' })).toBeTruthy();
      expect(screen.getByText('Purchase · HSD')).toBeTruthy();
    });

    it('offers "Earlier months" only when the server says something is older', () => {
      suppliers.push(sup({ name: 'Ledger Lal', currentBalance: '500' }));
      openings['Ledger Lal'] = '0';
      earlier['Ledger Lal'] = false;
      supplierLedgers['Ledger Lal'] = [{ ...PURCHASE, amount: '500' }];
      openSupplier('Ledger');
      expect(screen.queryByRole('button', { name: /Earlier months/ })).toBeNull();
    });
  });

  describe('statement', () => {
    const LEDGER = [
      { id: 'o', transactionType: 'Opening Balance', amount: '50000', businessDate: '2026-08-31' },
      {
        id: 'p1',
        transactionType: 'Purchase',
        amount: '1043200',
        notes: 'INV-1',
        businessDate: '2026-09-27',
      },
      { id: 'y1', transactionType: 'Payment', amount: '1110000', businessDate: '2026-09-29' },
      { id: 'p2', transactionType: 'Purchase', amount: '1029000', businessDate: '2026-10-03' },
      { id: 'y2', transactionType: 'Payment', amount: '980000', businessDate: '2026-10-06' },
      { id: 'p3', transactionType: 'Purchase', amount: '1043200', businessDate: '2026-10-09' },
    ];
    const months = () =>
      screen.getAllByRole('region').filter((r) => r.getAttribute('aria-label') !== 'Balance');

    it('groups by month, newest first, with a running balance that crosses into an advance', () => {
      suppliers.push(sup({ name: 'Ledger Lal', currentBalance: '1075400' }));
      supplierLedgers['Ledger Lal'] = LEDGER;
      openSupplier('Ledger');
      expect(months().map((r) => r.getAttribute('aria-label'))).toEqual([
        'October 2026',
        'September 2026',
        'August 2026',
      ]);
      const oct = within(months()[0])
        .getAllByRole('listitem')
        .map((li) => li.textContent);
      expect(oct[0]).toContain('Purchase');
      expect(oct[0]).toContain('+₹10,43,200.00');
      expect(oct[0]).toContain('Bal ₹10,75,400.00');
      expect(oct[1]).toContain('Payment made');
      expect(oct[1]).toContain('−₹9,80,000.00');
      expect(oct[1]).toContain('6 Oct');
      expect(oct[1]).toContain('Bal ₹32,200.00');
      const sep = within(months()[1])
        .getAllByRole('listitem')
        .map((li) => li.textContent);
      // paid more than owed: negative running balance = advance
      expect(sep[0]).toContain('Payment made');
      expect(sep[0]).toContain('Bal −₹16,800.00');
      expect(sep[1]).toContain('27 Sep · INV-1');
      expect(sep[1]).toContain('Bal ₹10,93,200.00');
      expect(within(months()[2]).getByText('Opening balance')).toBeTruthy();
      expect(screen.getByText(/Showing 6 of 6 entries/)).toBeTruthy();
      expect(screen.queryByRole('note')).toBeNull();
    });

    it('drops the running balance when the rows do not add up to the supplier balance', () => {
      suppliers.push(sup({ name: 'Ledger Lal', currentBalance: '999' }));
      supplierLedgers['Ledger Lal'] = LEDGER;
      openSupplier('Ledger');
      expect(within(balance()).getByText('₹999.00')).toBeTruthy();
      expect(screen.getByRole('note').textContent).toMatch(/Partial statement/);
      expect(document.body.textContent).not.toMatch(/Bal [₹−]/);
    });

    it('pages with Load more', () => {
      suppliers.push(sup({ name: 'Ledger Lal', currentBalance: '45' }));
      supplierLedgers['Ledger Lal'] = Array.from({ length: 45 }, (_, i) => ({
        id: `r${i}`,
        transactionType: 'Purchase',
        amount: '1',
        businessDate: '2026-10-01',
      }));
      openSupplier('Ledger');
      expect(screen.getByText(/Showing 20 of 45 entries/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      expect(screen.getByText(/Showing 40 of 45 entries/)).toBeTruthy();
    });

    it('shows loading, empty and error states', () => {
      ledgerState.isLoading = true;
      openSupplier('HPCL');
      expect(screen.getByText('Loading statement…')).toBeTruthy();
      cleanup();

      ledgerState.isLoading = false;
      suppliers.push(sup({ name: 'Brand New', currentBalance: '0' }));
      openSupplier('Brand');
      expect(screen.getByText('No transactions since 1 May 2026.')).toBeTruthy();
      cleanup();

      ledgerState.isError = true;
      openSupplier('HPCL');
      expect(screen.getByText(/Couldn’t load the statement/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    });
  });

  it('goes back to the Money tab', async () => {
    openSupplier('HPCL');
    await act(async () => {
      holder.nav.back();
      await new Promise((r) => setTimeout(r, 30));
    });
    // (this harness remounts the root; the shell keeps it mounted)
    expect(screen.getByRole('radio', { name: 'To pay' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'HPCL Kozhikode Depot' })).toBeNull();
  });
});

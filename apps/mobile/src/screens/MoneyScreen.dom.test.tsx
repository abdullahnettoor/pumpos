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
const ledgerState = { isLoading: false, isError: false };

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useCustomers: () => ({ data: customers, isLoading: false }),
    useSuppliers: () => ({ data: suppliers, isLoading: false }),
    useCustomerLedger: (id: string) => ({
      data: ledgers[id] ?? [],
      isLoading: ledgerState.isLoading,
      isError: ledgerState.isError,
      refetch: vi.fn(),
    }),
  };
});

const { MoneyScreen } = await import('./MoneyScreen.js');
const { NavProvider, useNav } = await import('../shell/nav.js');
const { stackOf } = await import('../shell/navStack.js');

const holder = { nav: null as unknown as ReturnType<typeof useNav> };
const Probe: React.FC = () => {
  const n = useNav();
  useLayoutEffect(() => {
    holder.nav = n;
  });
  return null;
};

/** The Money root, plus whatever page is on top of its stack (the shell does this with Panes). */
const Stage: React.FC<{ renderSupplierPage?: (s: any) => React.ReactNode }> = (props) => {
  const n = useNav();
  const stack = stackOf({ active: n.active, stacks: n.stacks, visited: [...n.visited] }, 'money');
  const top = stack[stack.length - 1];
  return top ? <>{top.element}</> : <MoneyScreen {...props} />;
};

const mount = (props: { renderSupplierPage?: (s: any) => React.ReactNode } = {}) =>
  render(
    <NavProvider tabs={['money']}>
      <Probe />
      <Stage {...props} />
    </NavProvider>,
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
  customers.length = 0;
  suppliers.length = 0;
  for (const k of Object.keys(ledgers)) delete ledgers[k];
  ledgerState.isLoading = false;
  ledgerState.isError = false;
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
afterEach(cleanup);

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
    const bar = (name: string) => within(row(name)).getByRole('progressbar');
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
    expect(bar('KTC Logistics').getAttribute('aria-valuenow')).toBe('100');
  });

  it('has no bar for a customer without a credit limit', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'See all 6 customers' }));
    expect(within(row('Ravi Autos')).queryByRole('progressbar')).toBeNull();
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
    expect(within(balance()).queryByText(/limit$/)).toBeNull();
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
      expect(within(m).getByText('Credit sale')).toBeTruthy();
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
      expect(items[1]).toContain('Credit sale');
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

    it('pages with Load more', () => {
      customers.push(cust({ name: 'Ledger Lou', currentBalance: '30', creditLimit: '100000' }));
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
      open('KTC Logistics');
      expect(screen.getByText('No transactions yet.')).toBeTruthy();
      cleanup();

      ledgerState.isError = true;
      mount();
      open('KTC Logistics');
      expect(screen.getByText(/Couldn’t load the statement/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    });
  });
});

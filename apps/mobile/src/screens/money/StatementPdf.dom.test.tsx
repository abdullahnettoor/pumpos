// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RangedPartyLedger } from '@pump/shared';

/**
 * Share / Download statement and the range Filter on the Customer and Supplier
 * pages. Real TanStack Query and real hooks; the ledger service and the PDF
 * generator (the part that needs a browser) are stubbed, so what is checked is
 * which range the screen asked for and what the PDF was built from.
 */
const pdfCalls: Array<{ station: any; data: any; output: string }> = [];
const pdfFailure: { error: Error | null } = { error: null };

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    generateStatementPdf: async (station: any, data: any, output: string) => {
      if (pdfFailure.error) throw pdfFailure.error;
      pdfCalls.push({ station, data, output });
    },
  };
});

const ui = await import('@pump/ui');
const { CustomerPage } = await import('./CustomerPage.js');
const { SupplierPage } = await import('./SupplierPage.js');
const { ShellContext } = await import('../../shell/context.js');
const { NavProvider } = await import('../../shell/nav.js');

const STATION = {
  id: 'st-1',
  name: 'Apex Station',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
} as any;

const CUSTOMER = {
  id: 'c1',
  name: 'KTC Logistics',
  customerType: 'Fleet',
  fleetCode: 'FLT-014',
  phone: '+91 98470 12345',
  currentBalance: '9500.00',
  creditLimit: '200000',
  metadata: { gstin: '32AAACH1118R1Z5' },
};
const SUPPLIER = {
  id: 's1',
  name: 'HPCL Depot',
  phone: '0495 1',
  currentBalance: '7000.00',
  metadata: { gstin: '32AAACH1118R1Z5' },
};

type Kind = 'customer' | 'supplier';

const ledgerFor = (kind: Kind, range: { from: string; to: string }): RangedPartyLedger => ({
  periodOpeningBalance: '5000.00',
  closingBalance: kind === 'customer' ? '9500.00' : '7000.00',
  hasEarlier: true,
  entries:
    kind === 'customer'
      ? [
          {
            id: 'a',
            transactionType: 'Credit Sale',
            amount: '8500.00',
            businessDate: range.from,
            runningBalance: '13500.00',
            notes: null,
            createdAt: `${range.from}T05:00:00Z`,
          },
          {
            id: 'b',
            transactionType: 'Collection',
            amount: '4000.00',
            businessDate: range.to,
            runningBalance: '9500.00',
            notes: null,
            createdAt: `${range.to}T05:00:00Z`,
            method: 'UPI',
            reference: 'COL-1',
          },
        ]
      : [
          {
            id: 'p',
            transactionType: 'Purchase',
            amount: '3000.00',
            businessDate: range.from,
            runningBalance: '8000.00',
            notes: null,
            createdAt: `${range.from}T05:00:00Z`,
            invoiceNumber: 'INV-7',
            productName: 'HSD',
          },
          {
            id: 'q',
            transactionType: 'Payment',
            amount: '1000.00',
            businessDate: range.to,
            runningBalance: '7000.00',
            notes: null,
            createdAt: `${range.to}T05:00:00Z`,
            method: 'BANK',
            fundingAccountName: 'HDFC Current',
          },
        ],
});

const asked: Array<{ id: string; from: string; to: string }> = [];
let held: { release: (v: RangedPartyLedger) => void } | null;
let failing = false;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 10:00 IST on 9 Oct 2026.
  vi.setSystemTime(new Date('2026-10-09T10:00:00+05:30'));
  asked.length = 0;
  pdfCalls.length = 0;
  pdfFailure.error = null;
  held = null;
  failing = false;
  vi.spyOn(ui.CloudTransactionService.prototype, 'getCustomers').mockResolvedValue([
    CUSTOMER,
  ] as any);
  vi.spyOn(ui.CloudTransactionService.prototype, 'getSuppliers').mockResolvedValue([
    SUPPLIER,
  ] as any);
  const ranged = (kind: Kind) => async (id: string, range: { from: string; to: string }) => {
    asked.push({ id, ...range });
    if (failing) throw new Error('offline');
    if (held) return new Promise<RangedPartyLedger>((resolve) => (held!.release = resolve));
    return ledgerFor(kind, range);
  };
  vi.spyOn(ui.CloudTransactionService.prototype, 'getCustomerLedgerRange').mockImplementation(
    ranged('customer') as any,
  );
  vi.spyOn(ui.CloudTransactionService.prototype, 'getSupplierLedgerRange').mockImplementation(
    ranged('supplier') as any,
  );
  vi.spyOn(ui.CloudShiftService.prototype, 'getCustomerReceivable').mockRejectedValue(
    new Error('no summary'),
  );
  vi.spyOn(ui.CloudShiftService.prototype, 'getSupplierPayable').mockRejectedValue(
    new Error('no summary'),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const mount = (kind: Kind, station: any = STATION) => {
  const qc = ui.createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ui.ToastProvider>
        <ShellContext.Provider
          value={{
            station,
            stationName: 'Apex Station',
            userName: 'Asha',
            role: 'Owner',
            openAccount: () => {},
          }}
        >
          <NavProvider tabs={['money']}>
            {kind === 'customer' ? (
              <CustomerPage customer={CUSTOMER as any} station={station} />
            ) : (
              <SupplierPage supplier={SUPPLIER as any} station={station} />
            )}
          </NavProvider>
        </ShellContext.Provider>
      </ui.ToastProvider>
    </QueryClientProvider>,
  );
};

const download = () => screen.getByRole('button', { name: 'Download statement' });
const share = () => screen.getByRole('button', { name: 'Share' });
const ready = () => waitFor(() => expect((download() as HTMLButtonElement).disabled).toBe(false));
const lastAsked = () => asked[asked.length - 1];

const openFilter = () => fireEvent.click(screen.getByRole('button', { name: /^Filter statement/ }));
const pick = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));

describe.each<Kind>(['customer', 'supplier'])('%s statement range and PDF', (kind) => {
  const party = kind === 'customer' ? CUSTOMER : SUPPLIER;

  it('shows this month, in the station calendar, and has Share and Download statement', async () => {
    mount(kind);
    await ready();
    expect(lastAsked()).toEqual({ id: party.id, from: '2026-10-01', to: '2026-10-31' });
    expect(screen.getByText('October 2026', { selector: 'p' })).toBeTruthy();
    expect(share()).toBeTruthy();
  });

  it("follows the station's timezone across midnight, not UTC", async () => {
    // 01:30 IST on 1 Nov is still 31 Oct in UTC.
    vi.setSystemTime(new Date('2026-10-31T20:00:00Z'));
    mount(kind);
    await ready();
    expect(lastAsked()).toMatchObject({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('Download statement builds the PDF from the ledger on screen, always as a download', async () => {
    mount(kind);
    await ready();
    fireEvent.click(download());
    await waitFor(() => expect(pdfCalls).toHaveLength(1));
    const { station, data, output } = pdfCalls[0];
    expect(output).toBe('download');
    expect(station.name).toBe('Apex Station');
    expect(data).toMatchObject({
      kind,
      from: '2026-10-01',
      to: '2026-10-31',
      periodLabel: 'October 2026',
      // The server's figures, not a client sum.
      openingBalance: '5000.00',
      closingBalance: kind === 'customer' ? '9500.00' : '7000.00',
    });
    expect(data.party.name).toBe(party.name);
    expect(data.party.lines).toContain('GSTIN 32AAACH1118R1Z5');
    expect(data.rows).toHaveLength(2);
  });

  it('Share goes through the platform saver (the share sheet on a phone)', async () => {
    mount(kind);
    await ready();
    fireEvent.click(share());
    await waitFor(() => expect(pdfCalls).toHaveLength(1));
    expect(pdfCalls[0].output).toBe('save');
  });

  it('waits for the statement before the PDF can be made', async () => {
    held = { release: () => {} };
    mount(kind);
    await waitFor(() => expect(asked.length).toBeGreaterThan(0));
    expect((download() as HTMLButtonElement).disabled).toBe(true);
    expect((share() as HTMLButtonElement).disabled).toBe(true);
    held.release(ledgerFor(kind, { from: '2026-10-01', to: '2026-10-31' }));
    await ready();
  });

  it('cannot make a PDF of a statement that failed to load', async () => {
    failing = true;
    mount(kind);
    await screen.findByText(/Couldn’t load the statement/, undefined, { timeout: 4000 });
    expect((download() as HTMLButtonElement).disabled).toBe(true);
  });

  it('says so when the PDF fails', async () => {
    pdfFailure.error = new Error('Could not build the PDF');
    mount(kind);
    await ready();
    fireEvent.click(download());
    expect(await screen.findByText('Could not build the PDF')).toBeTruthy();
  });

  describe('Filter', () => {
    it('Last month changes the screen and the PDF together', async () => {
      mount(kind);
      await ready();
      openFilter();
      pick('Last month');
      await waitFor(() =>
        expect(lastAsked()).toEqual({ id: party.id, from: '2026-09-01', to: '2026-09-30' }),
      );
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(await screen.findByText('September 2026', { selector: 'p' })).toBeTruthy();
      await ready();
      fireEvent.click(download());
      await waitFor(() => expect(pdfCalls).toHaveLength(1));
      expect(pdfCalls[0].data).toMatchObject({
        from: '2026-09-01',
        to: '2026-09-30',
        periodLabel: 'September 2026',
      });
    });

    it('does not show the previous range’s rows while another range loads', async () => {
      mount(kind);
      await ready();
      held = { release: () => {} };
      openFilter();
      pick('Last month');
      expect(await screen.findByText('Loading statement…')).toBeTruthy();
      expect((download() as HTMLButtonElement).disabled).toBe(true);
    });

    it('takes two dates, both inclusive, and the PDF covers them', async () => {
      mount(kind);
      await ready();
      openFilter();
      pick('Custom range');
      fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-05' } });
      fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-20' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply range' }));
      await waitFor(() =>
        expect(lastAsked()).toEqual({ id: party.id, from: '2026-09-05', to: '2026-09-20' }),
      );
      await ready();
      fireEvent.click(share());
      await waitFor(() => expect(pdfCalls).toHaveLength(1));
      expect(pdfCalls[0].data).toMatchObject({
        from: '2026-09-05',
        to: '2026-09-20',
        periodLabel: '5 Sep 2026 – 20 Sep 2026',
      });
    });

    it('refuses an end before the start and an end after today, and keeps the range', async () => {
      mount(kind);
      await ready();
      const before = asked.length;
      openFilter();
      pick('Custom range');
      fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-20' } });
      fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-05' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply range' }));
      expect(screen.getByRole('alert').textContent).toBe(
        'The end date can’t be before the start date.',
      );
      fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
      fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-20' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply range' }));
      expect(screen.getByRole('alert').textContent).toBe('The end date can’t be after today.');
      expect(asked.length).toBe(before);
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('marks the range on screen as the checked option', async () => {
      mount(kind);
      await ready();
      openFilter();
      const dialog = within(screen.getByRole('dialog'));
      expect(dialog.getByRole('radio', { name: 'This month' }).getAttribute('aria-checked')).toBe(
        'true',
      );
      expect(dialog.getByRole('radio', { name: 'Last month' }).getAttribute('aria-checked')).toBe(
        'false',
      );
    });

    it('a financial-year preset runs 1 April to 31 March', async () => {
      mount(kind);
      await ready();
      openFilter();
      pick('This financial year');
      await waitFor(() =>
        expect(lastAsked()).toMatchObject({ from: '2026-04-01', to: '2027-03-31' }),
      );
    });
  });

  describe('Earlier months', () => {
    it('adds a month to the screen and to the PDF', async () => {
      mount(kind);
      await ready();
      fireEvent.click(screen.getByRole('button', { name: 'Earlier months' }));
      await waitFor(() =>
        expect(lastAsked()).toEqual({ id: party.id, from: '2026-09-01', to: '2026-10-31' }),
      );
      await ready();
      fireEvent.click(download());
      await waitFor(() => expect(pdfCalls).toHaveLength(1));
      expect(pdfCalls[0].data).toMatchObject({
        from: '2026-09-01',
        to: '2026-10-31',
        periodLabel: '1 Sep 2026 – 31 Oct 2026',
      });
    });

    it('is not offered on a range picked by hand', async () => {
      mount(kind);
      await ready();
      openFilter();
      pick('Last month');
      await waitFor(() => expect(lastAsked().from).toBe('2026-09-01'));
      await ready();
      expect(screen.queryByRole('button', { name: 'Earlier months' })).toBeNull();
    });
  });
});

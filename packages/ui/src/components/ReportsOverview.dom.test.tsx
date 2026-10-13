/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { publishNavIntent, __resetNavIntentForTests } from '../nav-intent/store.js';
import { renderWithProviders } from '../test/renderWithProviders.js';

const range = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock('../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDailyDssrRange: () => ({ data: range.data, isLoading: false, error: null }),
}));
const preview = vi.hoisted(() => ({
  fn: (() => new Promise(() => {})) as (stationId: string, date: string) => Promise<unknown>,
}));
vi.mock('../services/cloud.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../services/cloud.js')>();
  class CloudShiftService extends mod.CloudShiftService {
    getDailyDssrPreview(stationId: string, date: string) {
      return preview.fn(stationId, date) as any;
    }
  }
  return { ...mod, CloudShiftService };
});
vi.mock('../access/CapabilityGate.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCapability: () => ({ status: 'enabled' }),
}));

const { ReportsOverview } = await import('./ReportsOverview.js');

afterEach(() => {
  cleanup();
  __resetNavIntentForTests();
  range.data = [];
});

const station = { id: 'st-1', name: 'Station', settings: {} };

const navText = () => screen.getByRole('navigation', { name: 'Reports' }).textContent!;
const item = (name: string | RegExp) => screen.queryByRole('button', { name });

describe('Reports sub-navigation (#540)', () => {
  it('groups the reports for an Owner: Sales · Finance · Tax & registers', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(navText()).toBe(
      [
        'Sales',
        'DSSR',
        'Attendant handovers',
        'Decantations',
        'Finance',
        'Profit & loss',
        'Ledgers',
        'Invoices',
        'Tax & registers',
        'GST',
        'Expense register',
      ].join(''),
    );
  });

  it('opens on the DSSR', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(item('DSSR')!.getAttribute('aria-current')).toBe('page');
  });

  it('no longer lists the Daily cash book, Templates or Cash & bank', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(navText()).not.toMatch(/cash book|Templates|Cash & bank|Tax register/i);
  });

  it.each(['Manager', 'Accountant'] as const)('hides Profit & loss from %s', (role) => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole={role} />);
    expect(item('Profit & loss')).toBeNull();
    expect(item('Ledgers')).toBeTruthy();
  });

  it('GST is one report with Sales · Purchases (ITC) · Income views', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    fireEvent.click(item('GST')!);
    const views = screen.getByRole('radiogroup', { name: 'GST view' });
    expect(views.textContent).toBe('SalesPurchases (ITC)Income');
  });

  it('a GST deep link opens the requested view', () => {
    act(() => publishNavIntent({ openReportsTab: 'gst', openGstView: 'income' }));
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(item('GST')!.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('radio', { name: 'Income' }).getAttribute('aria-checked')).toBe('true');
  });

  it('switching view after a GST deep link stays on GST (review #545)', () => {
    act(() => publishNavIntent({ openReportsTab: 'gst', openGstView: 'purchases' }));
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Income' }));
    expect(item('GST')!.getAttribute('aria-current')).toBe('page');
    expect(item('DSSR')!.getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Income' }).getAttribute('aria-checked')).toBe('true');
  });

  it('GST views share one period', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    fireEvent.click(item('GST')!);
    fireEvent.click(screen.getByRole('radio', { name: 'Purchases (ITC)' }));
    const firstDate = () => document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(firstDate(), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Income' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Purchases (ITC)' }));
    expect(firstDate().value).toBe('2026-01-01');
  });

  it('Ledgers holds the party ledger and cash & bank', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    fireEvent.click(item('Ledgers')!);
    expect(screen.getByRole('radiogroup', { name: 'Ledger view' }).textContent).toBe(
      'PartyCash & bank',
    );
  });
});

describe('Reports → DSSR deep link (review #545)', () => {
  const deferred = () => {
    let reject!: (e: unknown) => void;
    const promise = new Promise((_, rej) => (reject = rej));
    return { promise, reject };
  };

  it('switching report while the day loads does not snap back to the DSSR', async () => {
    const load = deferred();
    preview.fn = () => load.promise;
    act(() => publishNavIntent({ openDssrDate: '2026-10-01' }));
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(item('DSSR')!.getAttribute('aria-current')).toBe('page');

    fireEvent.click(item('Ledgers')!);
    await act(async () => {
      load.reject(new Error('no snapshot'));
      await load.promise.catch(() => {});
    });

    expect(item('Ledgers')!.getAttribute('aria-current')).toBe('page');
    expect(item('DSSR')!.getAttribute('aria-current')).toBeNull();
  });

  it('a deep link left alone settles on the DSSR and releases the intent', async () => {
    const load = deferred();
    preview.fn = () => load.promise;
    act(() => publishNavIntent({ openDssrDate: '2026-10-01' }));
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    await act(async () => {
      load.reject(new Error('no snapshot'));
      await load.promise.catch(() => {});
    });
    expect(item('DSSR')!.getAttribute('aria-current')).toBe('page');
    fireEvent.click(item('Ledgers')!);
    expect(item('Ledgers')!.getAttribute('aria-current')).toBe('page');
  });
});

describe('Reports → Decantations (#473)', () => {
  it.each(['Owner', 'Manager', 'Accountant'] as const)('is shown to %s', (role) => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole={role} />);
    expect(item(/Decantations/)).toBeTruthy();
  });

  it('is hidden from Staff', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Staff" />);
    expect(item(/Decantations/)).toBeNull();
  });
});

describe('Reports → Daily DSSR KPI strip (#516)', () => {
  /** Closed days as `composeDssr` freezes them. */
  const day = (businessDate: string, snapshotData: Record<string, unknown>) => ({
    id: businessDate,
    businessDate,
    snapshotData,
  });
  const fuel = (diesel: number, petrol: number) => ({
    totalVolume: diesel + petrol + 20,
    totalNetVolume: diesel + petrol,
    byProduct: [
      { productName: 'Diesel', unit: 'L', netVolume: diesel, salesValue: diesel * 90 },
      { productName: 'Petrol', unit: 'L', netVolume: petrol, salesValue: petrol * 103 },
    ],
  });
  const tile = (label: string) =>
    // The KPI strip comes before the table, which repeats "Net Volume Sold" as a header.
    (screen.getAllByText(label)[0].parentElement as HTMLElement).parentElement as HTMLElement;

  it('shows the net volume and cash sales of the closed days in range', () => {
    range.data = [
      day('2026-10-09', { shiftsIncluded: 2, fuel: fuel(1120, 1060), cashSales: 71275 }),
      day('2026-10-10', { shiftsIncluded: 2, fuel: fuel(1000, 900), cashSales: 64275.5 }),
    ];
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(tile('Net Volume Sold').textContent).toContain('4,080 L');
    expect(tile('Cash sales').textContent).toContain('1,35,550.50');
    expect(screen.queryByText('Cash Collected')).toBeNull();
  });

  it('still reads volume from a snapshot frozen before the net roll-up and cash sales', () => {
    range.data = [day('2026-09-01', { totalVolumeSold: 500 })];
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(tile('Net Volume Sold').textContent).toContain('500 L');
    expect(tile('Cash sales').textContent).toContain('—');
  });

  it('lists each day\'s cash sales so the tile is traceable, "—" for days without it', () => {
    range.data = [
      day('2026-10-09', { shiftsIncluded: 2, fuel: fuel(1120, 1060), cashSales: 71275 }),
      day('2026-09-01', { totalVolumeSold: 500 }),
    ];
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(screen.getByRole('columnheader', { name: /Cash sales/ })).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    const cashCell = (r: HTMLElement) => {
      const headers = screen.getAllByRole('columnheader');
      const i = headers.findIndex((h) => /Cash sales/.test(h.textContent ?? ''));
      return r.querySelectorAll('td')[i].textContent;
    };
    expect(rows.map(cashCell)).toEqual(['₹71,275.00', '—']);
  });
});

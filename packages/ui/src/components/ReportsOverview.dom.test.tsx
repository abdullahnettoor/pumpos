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
    generateDailyDssr(...args: unknown[]) {
      gen.calls.push(args);
      if (gen.result) return Promise.resolve(gen.result);
      return Promise.reject(Object.assign(new Error('offline'), { code: 'NETWORK' }));
    }
  }
  return { ...mod, CloudShiftService };
});
const view = vi.hoisted(() => ({ opened: null as unknown }));
vi.mock('./DailyDssrView.js', () => ({
  DailyDssrView: ({ dailyDssr }: { dailyDssr: unknown }) => {
    view.opened = dailyDssr;
    return <div data-testid="dsr-screen" />;
  },
}));
const gen = vi.hoisted(() => ({ calls: [] as unknown[][], result: null as unknown }));
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
        'DSR',
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

  it('opens on the DSR', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(item('DSR')!.getAttribute('aria-current')).toBe('page');
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
    expect(item('DSR')!.getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Income' }).getAttribute('aria-checked')).toBe('true');
  });

  it('GST views share one period', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    fireEvent.click(item('GST')!);
    fireEvent.click(screen.getByRole('radio', { name: 'Purchases (ITC)' }));
    const period = () => screen.getByRole('button', { name: /GST period/ });
    fireEvent.click(period());
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Last month/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Income' }));
    expect(period().textContent).toMatch(/^Last month/);
    fireEvent.click(screen.getByRole('radio', { name: 'Purchases (ITC)' }));
    expect(period().textContent).toMatch(/^Last month/);
  });

  it('Ledgers holds the party ledger and cash & bank', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    fireEvent.click(item('Ledgers')!);
    expect(screen.getByRole('radiogroup', { name: 'Ledger view' }).textContent).toBe(
      'PartyCash & bank',
    );
  });
});

describe('Reports → DSR deep link (review #545)', () => {
  const deferred = () => {
    let reject!: (e: unknown) => void;
    const promise = new Promise((_, rej) => (reject = rej));
    return { promise, reject };
  };

  it('switching report while the day loads does not snap back to the DSR', async () => {
    const load = deferred();
    preview.fn = () => load.promise;
    act(() => publishNavIntent({ openDssrDate: '2026-10-01' }));
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(item('DSR')!.getAttribute('aria-current')).toBe('page');

    fireEvent.click(item('Ledgers')!);
    await act(async () => {
      load.reject(new Error('no snapshot'));
      await load.promise.catch(() => {});
    });

    expect(item('Ledgers')!.getAttribute('aria-current')).toBe('page');
    expect(item('DSR')!.getAttribute('aria-current')).toBeNull();
  });

  it('a deep link left alone settles on the DSR and releases the intent', async () => {
    const load = deferred();
    preview.fn = () => load.promise;
    act(() => publishNavIntent({ openDssrDate: '2026-10-01' }));
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    await act(async () => {
      load.reject(new Error('no snapshot'));
      await load.promise.catch(() => {});
    });
    expect(item('DSR')!.getAttribute('aria-current')).toBe('page');
    fireEvent.click(item('Ledgers')!);
    expect(item('Ledgers')!.getAttribute('aria-current')).toBe('page');
  });
});

describe('Reports → DSR missing report and Generate (review #579)', () => {
  it('a deep link to a closed day with no report opens the DSR screen on Report missing', async () => {
    preview.fn = () =>
      Promise.reject(Object.assign(new Error('no snapshot'), { code: 'CONFLICT' }));
    act(() => publishNavIntent({ openDssrDate: '2026-10-01' }));
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(await screen.findByTestId('dsr-screen')).toBeTruthy();
    expect(view.opened).toEqual({ businessDate: '2026-10-01', snapshotData: null });
  });

  it('Generate sends one Idempotency-Key, kept when the outcome is unknown', async () => {
    gen.calls = [];
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    const button = screen.getByRole('button', { name: /Generate DSR/ });
    await act(async () => fireEvent.click(button));
    await act(async () => fireEvent.click(button));
    expect(gen.calls).toHaveLength(2);
    const key = (c: unknown[]) => (c[2] as { idempotencyKey: string }).idempotencyKey;
    expect(key(gen.calls[0])).toBeTruthy();
    expect(key(gen.calls[1])).toBe(key(gen.calls[0]));
  });

  it('a generated DSR opens from the response, and the list refreshes in the background', async () => {
    gen.calls = [];
    gen.result = { businessDate: '2026-10-14', snapshotData: { shiftsIncluded: 2 } };
    try {
      renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
      fireEvent.change(screen.getByLabelText('Business date to generate'), {
        target: { value: '2026-10-14' },
      });
      await act(async () => fireEvent.click(screen.getByRole('button', { name: /Generate DSR/ })));
      expect(await screen.findByTestId('dsr-screen')).toBeTruthy();
      expect(view.opened).toBe(gen.result);
    } finally {
      gen.result = null;
    }
  });

  it('shows Generate only to Roles the API lets generate', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Staff" />);
    expect(screen.queryByRole('button', { name: /Generate DSR/ })).toBeNull();
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

describe('Reports → Daily DSR KPI strip (#516)', () => {
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
    // The KPI tile reads "Net volume sold"; the table header below it is "Net Volume Sold".
    (screen.getAllByText(label)[0].parentElement as HTMLElement).parentElement as HTMLElement;

  it('shows the net volume and cash sales of the closed days in range', () => {
    range.data = [
      day('2026-10-09', { shiftsIncluded: 2, fuel: fuel(1120, 1060), cashSales: 71275 }),
      day('2026-10-10', { shiftsIncluded: 2, fuel: fuel(1000, 900), cashSales: 64275.5 }),
    ];
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(tile('Net volume sold').textContent).toContain('4,080 L');
    expect(tile('Cash sales').textContent).toContain('1,35,550.50');
    expect(screen.queryByText('Cash Collected')).toBeNull();
  });

  it('still reads volume from a snapshot frozen before the net roll-up and cash sales', () => {
    range.data = [day('2026-09-01', { totalVolumeSold: 500 })];
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(tile('Net volume sold').textContent).toContain('500 L');
    expect(tile('Cash sales').textContent).toContain('—');
  });

  it('lists each day\'s cash sales so the tile is traceable, "—" for days without it', () => {
    range.data = [
      day('2026-10-09', { shiftsIncluded: 2, fuel: fuel(1120, 1060), cashSales: 71275 }),
      day('2026-09-01', { totalVolumeSold: 500 }),
    ];
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(screen.getByRole('columnheader', { name: /Cash sales/ })).toBeTruthy();
    // Body rows only: the total row closes the table.
    const rows = Array.from(document.querySelectorAll('tbody tr')) as HTMLElement[];
    const cashCell = (r: HTMLElement) => {
      const headers = screen.getAllByRole('columnheader');
      const i = headers.findIndex((h) => /Cash sales/.test(h.textContent ?? ''));
      return r.querySelectorAll('td')[i].textContent;
    };
    expect(rows.map(cashCell)).toEqual(['₹71,275.00', '—']);
  });
});

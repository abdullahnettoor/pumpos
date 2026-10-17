/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { publishNavIntent, __resetNavIntentForTests } from '../nav-intent/store.js';
import { QueryObserver } from '@tanstack/react-query';
import { createTestQueryClient, renderWithProviders } from '../test/renderWithProviders.js';
import { queryKeys } from '../query/hooks.js';

const range = vi.hoisted(() => ({ data: [] as unknown[] }));
/** The role-filtered Access Document the screen reads; entitled unless a test says otherwise. */
const access = vi.hoisted(() => ({ doc: undefined as unknown }));
vi.mock('../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDailyDssrRange: () => ({ data: range.data, isLoading: false, error: null }),
  useAccess: () => ({ data: access.doc, isPending: false }),
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

const accessDoc = (capabilities: Record<string, unknown>, plan: 'CORE' | null = 'CORE') => ({
  ...(plan ? { plan } : {}),
  capabilities,
  limits: { station_count: { value: 1, used: 1, reached: true }, login_count: { value: 3, used: 0, reached: false } },
  subscription: { status: 'ACTIVE', mode: 'NORMAL' },
});
const ENTITLED = accessDoc({
  'reports.attendant': { enabled: true, title: 'Attendant Handover Report' },
});

beforeEach(() => {
  access.doc = ENTITLED;
});

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

describe('Locked Attendant handovers (#605)', () => {
  const navButton = () => screen.getByRole('button', { name: /Attendant handovers/ });

  it('an Owner sees the report locked: the plan and Contact us', () => {
    access.doc = accessDoc({
      'reports.attendant': {
        enabled: false,
        title: 'Attendant Handover Report',
        visibility: 'UPGRADE',
        unavailableMessage: 'Not part of your plan.',
        resolution: 'CONTACT_PUMPOS',
      },
    });
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(screen.getByRole('img', { name: 'Locked' })).toBeTruthy();
    fireEvent.click(navButton());
    const locked = screen.getByRole('region', { name: 'Attendant Handover Report is locked' });
    expect(locked.textContent).toMatch('Not included in your Core plan.');
    expect(screen.getByRole('button', { name: 'Contact us' })).toBeTruthy();
  });

  it('an Accountant sees it locked with whom to ask, and nothing commercial', () => {
    // The server sends other Roles no plan and no disabled entry.
    access.doc = accessDoc({}, null);
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Accountant" />);
    expect(screen.getByRole('img', { name: 'Locked' })).toBeTruthy();
    fireEvent.click(navButton());
    const locked = screen.getByRole('region', { name: 'Attendant Handover Report is locked' });
    expect(locked.textContent).toMatch('Ask your Owner or Manager to enable it.');
    expect(locked.textContent).not.toMatch(/plan|Contact/i);
    expect(screen.queryByRole('button', { name: 'Contact us' })).toBeNull();
  });

  it('shows no lock when the report is entitled, and no entry before access is known', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(screen.queryByRole('img', { name: 'Locked' })).toBeNull();
    cleanup();
    access.doc = undefined;
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(screen.queryByRole('button', { name: /Attendant handovers/ })).toBeNull();
  });

  it('Staff never see it: the Role comes first', () => {
    access.doc = accessDoc({}, null);
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Staff" />);
    expect(screen.queryByRole('button', { name: /Attendant handovers/ })).toBeNull();
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

  it('a generated DSR opens from the response while every DSR view refreshes in the background', async () => {
    gen.calls = [];
    gen.result = { businessDate: '2026-10-14', snapshotData: { shiftsIncluded: 2 } };
    const qc = createTestQueryClient();
    const dayKey = queryKeys.dssr('st-1', '2026-10-14');
    const dayListKey = queryKeys.businessDayList('st-1');
    qc.setQueryData(dayListKey, []);
    // Shifts › Business Day is watching that day; its refetch never answers.
    const watcher = new QueryObserver(qc, {
      queryKey: dayKey,
      queryFn: () => new Promise(() => {}),
      initialData: { stale: true },
      staleTime: Infinity,
    });
    const stop = watcher.subscribe(() => {});
    // The calendar opens on today's month: pin today to 15 Oct.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T08:00:00Z'));
    try {
      renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />, {
        queryClient: qc,
      });
      fireEvent.click(screen.getByRole('button', { name: /^Business date to generate: / }));
      fireEvent.click(screen.getByRole('button', { name: 'Wed 14 Oct 2026' }));
      await act(async () => fireEvent.click(screen.getByRole('button', { name: /Generate DSR/ })));
      // Generate settled and opened the response while the refetch is still out.
      expect(await screen.findByTestId('dsr-screen')).toBeTruthy();
      expect(view.opened).toBe(gen.result);
      expect(qc.getQueryState(dayKey)?.fetchStatus).toBe('fetching');
      expect(qc.getQueryState(dayKey)?.isInvalidated).toBe(true);
      expect(qc.getQueryState(dayListKey)?.isInvalidated).toBe(true);
      // The day just written holds the write's answer.
      expect(qc.getQueryData(queryKeys.dssrPreview('st-1', '2026-10-14'))).toBe(gen.result);
    } finally {
      vi.useRealTimers();
      stop();
      gen.result = null;
    }
  });

  // Review (#603): the generate picker stops at the station's business date.
  it("caps the generate date at the station's business date, not the calendar day", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 05:30 in Kochi on 15 Oct: before the 06:00 Day Start, so still 14 Oct's business day.
    vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
    try {
      const kochi = {
        ...station,
        settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
      };
      renderWithProviders(<ReportsOverview selectedStation={kochi} userRole="Owner" />);
      const picker = screen.getByRole('button', { name: /^Business date to generate: / });
      expect(picker.textContent).toBe('Wed 14 Oct 2026');
      fireEvent.click(picker);
      expect(screen.getByRole('button', { name: 'Wed 14 Oct 2026' }).hasAttribute('disabled')).toBe(
        false,
      );
      expect(screen.getByRole('button', { name: 'Thu 15 Oct 2026' }).hasAttribute('disabled')).toBe(
        true,
      );
    } finally {
      vi.useRealTimers();
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

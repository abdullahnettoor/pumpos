// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Station } from '@pump/shared';
import type { TabKey } from '../shell/tabs.js';

/**
 * Screen tests for Home: the honest sales headline (fuel from closed Shifts
 * only, Product Sales live), its labels, the top-2 alerts, tank colours and the
 * absence of the old KPI grid and drawers. `@pump/ui` is the mock seam for the
 * read hooks (as in the other screen tests); everything else is real.
 */
const q = (data: unknown, extra: Record<string, unknown> = {}) => ({
  data,
  isLoading: false,
  isError: false,
  ...extra,
});

const feed = vi.hoisted(() => ({
  previewCalls: [] as string[],
  preview: {} as Record<string, unknown>,
  status: null as unknown,
  range: [] as unknown[],
  tanks: [] as unknown[],
  customers: [] as unknown[],
  suppliers: [] as unknown[],
  alerts: [] as unknown[],
  previewError: false,
  assignment: null as unknown,
}));

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useDailyDssrPreview: (_station: string, date: string) => {
      feed.previewCalls.push(date);
      return q(feed.preview[date] ?? null, { isError: feed.previewError && date === lastToday });
    },
    useDailyDssrRange: () => q(feed.range),
    useShiftStatus: () => q(feed.status),
    useMyAssignment: () => q(feed.assignment),
    useInventoryStatus: () => q(feed.tanks),
    useCustomers: () => q(feed.customers),
    useSuppliers: () => q(feed.suppliers),
  };
});
vi.mock('../lib/alerts.js', () => ({ useMobileAlerts: () => feed.alerts }));

const { HomeScreen } = await import('./HomeScreen.js');
const { NavProvider, useNav } = await import('../shell/nav.js');
const { HOME_ATTENTION_ID } = await import('../shell/attention.js');

let lastToday = '';
const station = (settings: Record<string, unknown> = {}) =>
  ({ id: 'st-1', name: 'Highway Fuels', settings }) as unknown as Station;
const IST = { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' };

/** Today's live preview: Shift 1 closed (fuel counted), Shift 2 running, products live. */
const todayPreview = (date: string) => ({
  businessDate: date,
  live: true,
  snapshotData: {
    fuel: {
      totalSalesValue: 212880,
      byProduct: [
        {
          productId: 'ms',
          productName: 'Petrol',
          productCode: 'MS',
          unit: 'L',
          netVolume: 1060,
          salesValue: 109095,
        },
        {
          productId: 'hsd',
          productName: 'Diesel',
          productCode: 'HSD',
          unit: 'L',
          netVolume: 1120,
          salesValue: 100330,
        },
        {
          productId: 'xp',
          productName: 'Premium',
          productCode: 'XP95',
          unit: 'L',
          netVolume: 31,
          salesValue: 3455,
        },
      ],
    },
    merchandise: { salesValue: 6840 },
    pnl: {
      revenue: 219720,
      cogs: 198000,
      grossMargin: 21720,
      byProduct: [
        { productId: 'm1', kind: 'merchandise', name: 'Engine oil', quantity: 14, revenue: 4920 },
        { productId: 'm2', kind: 'merchandise', name: 'Coolant', quantity: 6, revenue: 1920 },
      ],
    },
    credit: { total: 27520, count: 4 },
    purchases: { total: 1043200, count: 1 },
    drawer: {
      totalCashVariance: 0,
      totalAttendantVariance: -340,
      attendants: [{ attendantName: 'Vinod M', duName: 'DU3', variance: -340 }],
    },
    shifts: [
      {
        shiftId: 's1',
        shiftSequence: 1,
        templateName: 'Shift 1',
        netVolume: 2211,
        fuelSalesValue: 212880,
      },
    ],
  },
});

const previousPreview = (date: string) => ({
  businessDate: date,
  snapshotData: {
    shifts: [
      { shiftSequence: 1, templateName: 'Shift 1', fuelSalesValue: 204300 },
      { shiftSequence: 2, templateName: 'Shift 2', fuelSalesValue: 259010 },
    ],
  },
});

const day = (businessDate: string, fuel: number) => ({
  businessDate,
  snapshotData: { fuel: { totalSalesValue: fuel }, merchandise: { salesValue: 5000 } },
});

const openShift = (businessDate: string) => ({
  activeShift: {
    templateName: 'Shift 2',
    openedAt: '2026-10-09T08:30:00.000Z',
    businessDate,
    staffAssignments: [
      { userId: 'u1', duId: 'd1' },
      { userId: 'u2', duId: 'd2' },
      { userId: 'u3', duId: 'd3' },
    ],
  },
});

const alert = (id: string, severity: string, title: string, action?: unknown) => ({
  id,
  severity,
  category: action ? 'day' : 'stock',
  title,
  action,
});

const NavProbe: React.FC<{ onNav: (n: ReturnType<typeof useNav>) => void }> = ({ onNav }) => {
  onNav(useNav());
  return null;
};

let nav: ReturnType<typeof useNav>;
const renderHome = (
  st = station(IST),
  tabs: readonly TabKey[] = ['home', 'reports', 'money', 'shifts'],
) =>
  render(
    <NavProvider tabs={tabs}>
      <NavProbe onNav={(n) => (nav = n)} />
      <HomeScreen station={st} />
    </NavProvider>,
  );

/** 15:30 IST on Fri 9 Oct 2026: after Day Start, so the Business Date is 9 Oct. */
const AFTERNOON = new Date('2026-10-09T10:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AFTERNOON);
  lastToday = '2026-10-09';
  Object.assign(feed, {
    assignment: null,
    previewCalls: [],
    preview: {
      '2026-10-09': todayPreview('2026-10-09'),
      '2026-10-08': previousPreview('2026-10-08'),
    },
    status: openShift('2026-10-09'),
    range: [
      day('2026-10-03', 400000),
      day('2026-10-04', 420000),
      day('2026-10-05', 390000),
      day('2026-10-08', 465000),
    ],
    tanks: [
      {
        id: 't1',
        name: 'Tank 1',
        productCode: 'MS',
        productName: 'Petrol',
        capacity: 20000,
        currentVolume: 12400,
        productUnit: 'L',
      },
      {
        id: 't2',
        name: 'Tank 2',
        productCode: 'HSD',
        productName: 'Diesel',
        capacity: 20000,
        currentVolume: 3600,
        productUnit: 'L',
      },
      {
        id: 't3',
        name: 'Tank 3',
        productCode: 'XP95',
        productName: 'Premium',
        capacity: 10000,
        currentVolume: 3500,
        productUnit: 'L',
      },
    ],
    customers: [{ currentBalance: 500000 }, { currentBalance: 182400 }, { currentBalance: 0 }],
    suppliers: [{ currentBalance: 1043200 }],
    alerts: [],
    previewError: false,
  });
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const myAssignment = (over: Record<string, unknown> = {}) => ({
  userId: 'u1',
  station: { id: 'st-1', name: 'Highway Fuels' },
  shift: { id: 's2', templateName: 'Shift 2', openedAt: '2026-10-09T08:30:00.000Z' },
  dispenserUnits: [{ duId: 'du-2', duName: 'DU2', nozzles: [], terminals: [] }],
  ...over,
});

describe('Home: your handover card', () => {
  it('is absent when the user holds no Dispenser Unit', () => {
    renderHome();
    expect(screen.queryByText(/Your handover/)).toBeNull();
    feed.assignment = myAssignment({ dispenserUnits: [] });
    cleanup();
    renderHome();
    expect(screen.queryByText(/Your handover/)).toBeNull();
  });

  it('is the first thing on Home and names the DU, the Shift and what the server knows', () => {
    feed.assignment = myAssignment();
    const { container } = renderHome();
    const card = screen.getByRole('button', { name: /Your handover · DU2/ });
    expect(card.textContent).toContain('Shift 2 · Not saved yet');
    expect(card.textContent).toContain('Continue');
    expect(container.querySelector('button, section')).toBe(card);
  });

  it('counts the credit and fuel-card slips already recorded', () => {
    const slip = { id: 'a', customerId: 'c', customerName: 'KTC', amount: 100 };
    feed.assignment = myAssignment({
      dispenserUnits: [
        {
          duId: 'du-2',
          duName: 'DU2',
          nozzles: [],
          terminals: [],
          creditSales: [slip, { ...slip, id: 'b' }],
        },
      ],
    });
    renderHome();
    expect(screen.getByRole('button', { name: /Your handover/ }).textContent).toContain(
      'Not saved yet · 2 credit slips',
    );
  });

  it('shows a saved handover with its variance', () => {
    feed.assignment = myAssignment({
      dispenserUnits: [
        {
          duId: 'du-2',
          duName: 'DU2',
          nozzles: [],
          terminals: [],
          handover: {
            cashHandedOver: '900',
            varianceAmount: '-340',
            createdAt: '2026-10-09T12:10:00Z',
          },
        },
      ],
    });
    renderHome();
    const text = screen.getByRole('button', { name: /Your handover/ }).textContent;
    expect(text).toMatch(/Saved \d{1,2}:\d{2} [ap]m · −₹340/);
    expect(text).toContain('Edit');
  });

  it('opens the handover as a detail page on Home', () => {
    feed.assignment = myAssignment();
    renderHome();
    expect(nav.depth).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: /Your handover/ }));
    expect(nav.depth).toBe(1);
    expect(nav.active).toBe('home');
    expect(nav.stacks.home?.at(-1)?.id).toBe('handover');
  });

  it('goes when the Shift closes, because the assignment does', () => {
    feed.assignment = myAssignment();
    const { rerender } = renderHome();
    expect(screen.getByText(/Your handover/)).toBeTruthy();
    feed.assignment = null;
    rerender(
      <NavProvider tabs={['home']}>
        <HomeScreen station={station(IST)} />
      </NavProvider>,
    );
    expect(screen.queryByText(/Your handover/)).toBeNull();
  });
});

describe('Home: honest sales headline', () => {
  it('counts closed-Shift fuel plus every Product Sale, never the open Shift fuel', () => {
    renderHome();
    const headline = screen.getByText('Sales so far today').parentElement!;
    // 2,12,880 fuel (Shift 1 only) + 6,840 products
    expect(within(headline).getByText('₹2,19,720')).toBeTruthy();
    expect(within(headline).getByText(/2,211 L fuel · ₹6,840 products/)).toBeTruthy();
  });

  it('shows the hatched open-Shift segment and the "counted at close" label while a Shift is open', () => {
    const { container } = renderHome();
    expect(screen.getByText('Shift 2 fuel · counted at close')).toBeTruthy();
    // Under the headline bar and on the Sales by product fuel group.
    expect(screen.getAllByText('Shift 1 · closed')).toHaveLength(2);
    const kinds = [...container.querySelectorAll('[data-segment]')].map((e) =>
      e.getAttribute('data-segment'),
    );
    expect(kinds).toEqual(['closed', 'open']);
  });

  it('drops the hatched segment and the label when no Shift is open', () => {
    feed.status = { activeShift: null };
    const { container } = renderHome();
    expect(screen.queryByText(/counted at close/)).toBeNull();
    expect(screen.getByText('No open shift')).toBeTruthy();
    expect(
      [...container.querySelectorAll('[data-segment]')].map((e) => e.getAttribute('data-segment')),
    ).toEqual(['closed']);
  });

  it('does not hatch for a Shift that belongs to an earlier Business Day', () => {
    feed.status = openShift('2026-10-08');
    renderHome();
    expect(screen.getByText('Shift 2 live')).toBeTruthy();
    expect(screen.queryByText(/counted at close/)).toBeNull();
  });

  it('labels the products group Live and the fuel group with its closed Shifts', () => {
    renderHome();
    const card = screen
      .getByText('Total sales')
      .closest('div[class*="rounded-[14px]"]') as HTMLElement;
    expect(within(card).getByText('Live')).toBeTruthy();
    expect(within(card).getByText('Shift 1 · closed')).toBeTruthy();
    expect(within(card).getByText('Petrol')).toBeTruthy();
    expect(within(card).getByText('Engine oil')).toBeTruthy();
  });
});

describe('Home: live Shift strip', () => {
  it('names the Shift, when it opened, attendants and the running clock', () => {
    renderHome();
    const strip = screen.getByRole('region', { name: 'Live shift' });
    expect(within(strip).getByText('Shift 2 live')).toBeTruthy();
    expect(within(strip).getByText('Since 2:00 pm · 3 attendants')).toBeTruthy();
    expect(within(strip).getByText('1h 30m')).toBeTruthy();
  });
});

describe('Home: comparison and sparkline', () => {
  it('compares closed-Shift fuel with the same Shift position yesterday', () => {
    renderHome();
    expect(screen.getByText(/4\.2% fuel vs Thu Shift 1/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /Sales over the last 4 closed days/ })).toBeTruthy();
  });

  it('hides both, instead of showing 0%, when there is nothing to compare', () => {
    feed.preview = { '2026-10-09': todayPreview('2026-10-09') };
    feed.range = [];
    renderHome();
    expect(screen.queryByText(/vs Thu/)).toBeNull();
    expect(screen.queryByText(/0%/)).toBeNull();
    expect(screen.queryByRole('img', { name: /Sales over/ })).toBeNull();
  });

  it('needs at least two closed days for a sparkline', () => {
    feed.range = [day('2026-10-08', 465000)];
    renderHome();
    expect(screen.queryByRole('img', { name: /Sales over/ })).toBeNull();
  });
});

describe('Home: tiles', () => {
  it('shows office cash variance with the attendant level beneath, margin, credit slips and purchases', () => {
    renderHome();
    const tile = (label: string) => screen.getByText(label).parentElement!;
    // Office count at the top, attendant level named by DU beneath: never summed.
    expect(within(tile('Cash variance')).getByText('₹0')).toBeTruthy();
    expect(within(tile('Cash variance')).getByText('1 closed Shift')).toBeTruthy();
    expect(within(tile('Cash variance')).getByText('Attendants −₹340 · DU3 short')).toBeTruthy();
    expect(within(tile('Gross margin')).getByText('₹21,720')).toBeTruthy();
    expect(within(tile('Credit sales')).getByText('4 slips')).toBeTruthy();
    expect(within(tile('Purchases')).getByText('1 purchase')).toBeTruthy();
    expect(within(tile('Purchases')).getByText('₹10.43L')).toBeTruthy();
  });
});

describe('Home: attention', () => {
  const four = [
    alert('a1', 'danger', 'HSD critically low'),
    alert('a2', 'danger', 'Fleet Co over credit limit', {
      kind: 'customer',
      customer: { id: 'c1', name: 'Fleet Co' },
    }),
    alert('a3', 'warning', 'Wed, 7 Oct not closed', { kind: 'day', businessDate: '2026-10-07' }),
    alert('a4', 'info', 'Petrol over capacity'),
  ];

  it('shows the top two alerts and a link to all of them', () => {
    feed.alerts = four;
    renderHome();
    const section = screen.getByRole('region', { name: 'Needs attention' });
    expect(within(section).getByText('HSD critically low')).toBeTruthy();
    expect(within(section).getByText('Fleet Co over credit limit')).toBeTruthy();
    expect(within(section).queryByText(/not closed/)).toBeNull();
    expect(within(section).getByRole('button', { name: 'All 4 alerts' })).toBeTruthy();
  });

  it('keeps the section the header bell scrolls to, even with nothing to report', () => {
    renderHome();
    const section = document.getElementById(HOME_ATTENTION_ID)!;
    expect(section).toBeTruthy();
    expect(section.getAttribute('tabindex')).toBe('-1');
    expect(within(section).getByText('Nothing needs attention')).toBeTruthy();
  });

  it('opens the page an alert explains, on top of Home', () => {
    feed.alerts = four;
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: /Fleet Co over credit limit/ }));
    expect(nav.active).toBe('home');
    expect(nav.depth).toBe(1);
  });

  it('gives a stock alert no action', () => {
    feed.alerts = four;
    renderHome();
    expect(screen.queryByRole('button', { name: /HSD critically low/ })).toBeNull();
    expect(screen.getByText('HSD critically low')).toBeTruthy();
  });

  it('does not offer a page whose tab the Role cannot open', () => {
    feed.alerts = [
      alert('a1', 'danger', 'Fleet Co over credit limit', {
        kind: 'customer',
        customer: { id: 'c1', name: 'Fleet Co' },
      }),
    ];
    renderHome(station(IST), ['home']);
    expect(screen.queryByRole('button', { name: /Fleet Co over credit limit/ })).toBeNull();
    expect(screen.getByText('Fleet Co over credit limit')).toBeTruthy();
  });

  it('"All N" opens the Needs attention page', () => {
    feed.alerts = four;
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'All 4 alerts' }));
    expect(nav.depth).toBe(1);
  });
});

describe('Home: tanks, money, removed sections', () => {
  it('colours tank gauges red below 25% and amber below 40%', () => {
    const { container } = renderHome();
    const level = (title: string) =>
      screen.getByText(title).closest('[data-level]')!.getAttribute('data-level');
    expect(level('MS')).toBe('ok'); // 62%
    expect(level('HSD')).toBe('red'); // 18%
    expect(level('XP95')).toBe('amber'); // 35%
    expect(container.querySelectorAll('[data-level]')).toHaveLength(3);
    expect(screen.getByText('18%')).toBeTruthy();
    expect(screen.getByText('12.4 KL')).toBeTruthy();
  });

  it('opens Money from To collect and To pay', () => {
    renderHome();
    const collect = screen.getByText('To collect').closest('button')!;
    expect(within(collect).getByText('₹6.82L')).toBeTruthy();
    expect(within(collect).getByText('2 customers with dues')).toBeTruthy();
    fireEvent.click(collect);
    expect(nav.active).toBe('money');
    expect(within(screen.getByText('To pay').closest('button')!).getByText('₹10.43L')).toBeTruthy();
  });

  it('has no drawers section and none of the old KPI grid', () => {
    renderHome();
    for (const gone of [/drawer/i, 'Receivables', 'Payables', 'Fuel sales today', /7-day/]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });
});

describe('Home: Business Date', () => {
  it('uses the station-timezone date after Day Start', () => {
    renderHome();
    expect(feed.previewCalls).toContain('2026-10-09');
    expect(screen.getByText('Sales · Fri, 9 Oct')).toBeTruthy();
  });

  it('still shows the previous Business Date before Day Start', () => {
    // 04:00 IST on 9 Oct: the sales day that started at 06:00 on 8 Oct is still running.
    vi.setSystemTime(new Date('2026-10-08T22:30:00Z'));
    lastToday = '2026-10-08';
    feed.preview = {
      '2026-10-08': todayPreview('2026-10-08'),
      '2026-10-07': previousPreview('2026-10-07'),
    };
    feed.status = openShift('2026-10-08');
    renderHome();
    expect(feed.previewCalls).toContain('2026-10-08');
    expect(feed.previewCalls).toContain('2026-10-07');
    expect(feed.previewCalls).not.toContain('2026-10-09');
    expect(screen.getByText('Sales · Thu, 8 Oct')).toBeTruthy();
    expect(screen.getByText('Shift 2 fuel · counted at close')).toBeTruthy();
  });

  it('shows an empty day, not an error, before anything has happened', () => {
    feed.preview = {};
    feed.status = { activeShift: null };
    renderHome();
    expect(
      within(screen.getByText('Sales so far today').parentElement!).getByText('₹0'),
    ).toBeTruthy();
    expect(screen.getAllByText('No closed Shift yet').length).toBeGreaterThan(0);
    expect(screen.getByText('Fuel appears once a Shift closes.')).toBeTruthy();
  });

  it('says so when the sales cannot be loaded', () => {
    feed.preview = {};
    feed.previewError = true;
    renderHome();
    expect(screen.getByText(/Could not load today/)).toBeTruthy();
  });

  it('keeps showing the last good sales when a refresh fails', () => {
    feed.previewError = true;
    renderHome();
    expect(screen.queryByText(/Could not load today/)).toBeNull();
    expect(screen.getByText('₹2,19,720', { selector: 'p' })).toBeTruthy();
  });
});

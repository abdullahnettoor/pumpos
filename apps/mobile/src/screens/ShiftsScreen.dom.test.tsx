// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Station } from '@pump/shared';

/**
 * Screen tests for the Shifts tab and the Shift Summary page: history grouped
 * by Shift Business Date, the view-only live card, navigation into a summary,
 * its sections (incl. a Shift with no product sales / no credit) and the
 * Share / Download action bar. `@pump/ui` is the mock seam for the read hooks
 * and the PDF generator; everything else is real.
 */
const q = (data: unknown, extra: Record<string, unknown> = {}) => ({
  data,
  isLoading: false,
  isError: false,
  ...extra,
});

const feed = vi.hoisted(() => ({
  status: null as unknown,
  /** Every closed Shift, newest first; the history hook serves them PAGE rows at a time. */
  summaries: [] as { shiftId: string }[],
  pageSize: 50,
  /** Business Day status: every open day before the Current Business Date. */
  pastOpen: [] as { businessDate: string }[],
  nozzles: [] as unknown[],
  dispensers: [] as unknown[],
  pdf: [] as unknown[][],
  /** Shift ids the by-id read was asked for. */
  byIdReads: [] as string[],
}));

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useShiftStatus: () => q(feed.status),
    useBusinessDayStatus: () => q({ pastOpenBusinessDays: feed.pastOpen }),
    useShiftSummaryHistory: () => {
      const [loaded, setLoaded] = React.useState(1);
      const shown = feed.summaries.slice(0, loaded * feed.pageSize);
      const pages = [];
      for (let i = 0; i < shown.length; i += feed.pageSize)
        pages.push(shown.slice(i, i + feed.pageSize));
      return {
        ...q({ pages }),
        hasNextPage: shown.length < feed.summaries.length,
        isFetchingNextPage: false,
        fetchNextPage: async () => setLoaded((n) => n + 1),
      };
    },
    // The by-id read: any age, not just the newest page. An unknown id is a 404.
    useShiftSummaryById: (shiftId: string) => {
      feed.byIdReads.push(shiftId);
      const found = feed.summaries.find((r) => r.shiftId === shiftId);
      return found ? q(found) : q(undefined, { isError: true });
    },
    useNozzles: () => q(feed.nozzles),
    useDispensers: () => q(feed.dispensers),
    generateShiftSummaryPdf: async (...args: unknown[]) => void feed.pdf.push(args),
  };
});

const { ShiftsScreen } = await import('./ShiftsScreen.js');
const { ShiftSummaryPage } = await import('./ShiftSummaryPage.js');
const { NavProvider, useNav } = await import('../shell/nav.js');
const { ToastProvider } = await import('@pump/ui');

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
} as unknown as Station;

// 5:12 pm IST on Fri 9 Oct 2026: the Current Business Date is 2026-10-09.
const NOW = Date.parse('2026-10-09T11:42:00.000Z');

const row = (
  shiftId: string,
  businessDate: string,
  sequence: number,
  openedAt: string,
  closedAt: string,
  snapshotData: Record<string, unknown>,
) => ({
  shiftId,
  status: 'CLOSED',
  businessDate,
  shiftSequence: sequence,
  templateName: `Shift ${sequence}`,
  openedAt,
  closedAt,
  snapshotData,
});

const closedSnapshot = (over: Record<string, unknown> = {}) => ({
  cashVarianceModel: 2,
  totalFuelSalesValue: 213200,
  fuelByProduct: [
    { productName: 'Petrol', productCode: 'MS', unit: 'L', netVolume: 980, salesValue: 102200 },
    { productName: 'Diesel', productCode: 'HSD', unit: 'L', netVolume: 1240, salesValue: 111000 },
  ],
  nozzleReadings: [
    {
      nozzleId: 'n1',
      nozzleName: 'N1',
      duName: 'DU1',
      productCode: 'MS',
      productName: 'Petrol',
      openingReading: 184220.4,
      closingReading: 185200.4,
      volumeSold: 980,
      testingVolume: 0,
      netVolume: 980,
      unit: 'L',
    },
  ],
  handovers: [{ cardHandedOver: '1000', upiHandedOver: '2000', creditHandedOver: '0' }],
  payments: { cash: 210200, upi: 2000, card: 1000, credit: 0 },
  productSales: { total: 0, lines: [] },
  totalSalesValue: 213200,
  cashSalesSum: 210200,
  creditSalesTotal: 0,
  attendantVariance: -340,
  officeCountVariance: 0,
  cashVariance: 0,
  closingCash: 70000,
  expectedCash: 70000,
  drawers: [
    {
      attendantId: 'u1',
      duId: 'd1',
      duName: 'DU1',
      attendantName: 'Ramesh K',
      expectedCash: 34420,
      cashHandedOver: 34420,
      variance: 0,
    },
    {
      attendantId: 'u3',
      duId: 'd3',
      duName: 'DU3',
      attendantName: 'Vinod M',
      expectedCash: 31800,
      cashHandedOver: 31460,
      variance: -340,
    },
  ],
  ...over,
});

const HISTORY = [
  row('s-today', '2026-10-09', 1, '2026-10-09T00:30:00Z', '2026-10-09T08:22:00Z', closedSnapshot()),
  row(
    's-y2',
    '2026-10-08',
    2,
    // 3:30 am IST on the 9th, yet it belongs to the 8th's Business Date.
    '2026-10-08T22:00:00Z',
    '2026-10-09T02:00:00Z',
    closedSnapshot({
      totalFuelSalesValue: 259010,
      totalSalesValue: 259010,
      attendantVariance: 0,
      drawers: [],
      fuelByProduct: [],
    }),
  ),
  row(
    's-y1',
    '2026-10-08',
    1,
    '2026-10-08T00:30:00Z',
    '2026-10-08T08:22:00Z',
    closedSnapshot({
      totalFuelSalesValue: 206530,
      totalSalesValue: 206530,
      attendantVariance: 0,
      officeCountVariance: 120,
      drawers: [],
      fuelByProduct: [],
    }),
  ),
];

const liveStatus = {
  businessDay: { status: 'OPEN', businessDate: '2026-10-09' },
  activeShift: {
    id: 'live',
    templateName: 'Shift 2',
    businessDate: '2026-10-09',
    openedAt: '2026-10-09T08:30:00.000Z',
    openedByName: 'Abdullah',
    scheduledEndTime: '22:00',
    nozzleReadings: [{}, {}, {}, {}, {}, {}],
    reconciliation: { openingFloat: 6000, handoverCashDrops: 30000 },
    staffAssignments: [
      { id: 'a1', userId: 'u1', duId: 'd1', userName: 'Ramesh K', duName: 'DU1' },
      { id: 'a2', userId: 'u2', duId: 'd2', userName: 'Sajid P', duName: 'DU2' },
      { id: 'a3', userId: 'u3', duId: 'd3', userName: 'Vinod M', duName: 'DU3' },
    ],
    handovers: [{ userId: 'u2', duId: 'd2', cashHandedOver: '21480', varianceAmount: '0' }],
  },
};

const Stage: React.FC = () => {
  const nav = useNav();
  const top = (nav.stacks.shifts ?? []).at(-1);
  return top ? <>{top.element}</> : <ShiftsScreen station={station} />;
};

const mount = () =>
  render(
    <ToastProvider>
      <NavProvider tabs={['shifts']}>
        <Stage />
      </NavProvider>
    </ToastProvider>,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  feed.status = liveStatus;
  feed.summaries = HISTORY;
  feed.nozzles = [{ id: 'n1', duId: 'd1' }];
  feed.dispensers = [{ id: 'd1', name: 'DU1' }];
  feed.pastOpen = [];
  feed.pageSize = 50;
  feed.byIdReads = [];
  feed.pdf = [];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Shifts tab: live Shift', () => {
  it('shows the header figures and one row per DU with its status', () => {
    mount();
    const live = screen.getByRole('region', { name: 'Live shift' });
    expect(within(live).getByText('Shift 2')).toBeTruthy();
    expect(within(live).getByText(/Fri, 9 Oct · since 2:00 pm/)).toBeTruthy();
    expect(within(live).getByText('3h 12m')).toBeTruthy();
    expect(within(live).getByText('₹6,000')).toBeTruthy(); // opening floats
    expect(within(live).getByText('₹30,000')).toBeTruthy(); // cash drops
    expect(within(live).getByText('6')).toBeTruthy(); // nozzles
    expect(within(live).getByText('1 / 3')).toBeTruthy();
    expect(within(live).getAllByText('Pending')).toHaveLength(2);
    expect(within(live).getByText('Recorded')).toBeTruthy();
    expect(within(live).getByText('Declared ₹21,480 · balanced')).toBeTruthy();
    expect(screen.getByText('Opened by Abdullah')).toBeTruthy();
  });

  it('marks pending DUs "Handover due" once the Shift is past its scheduled end', () => {
    vi.setSystemTime(Date.parse('2026-10-09T17:00:00.000Z'));
    mount();
    expect(screen.getAllByText('Handover due')).toHaveLength(2);
  });

  it('is view-only: no cash drop or close shift button', () => {
    mount();
    expect(screen.queryByRole('button', { name: /cash drop/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /close shift/i })).toBeNull();
  });

  it('says so when no Shift is open', () => {
    feed.status = { businessDay: null, activeShift: null };
    mount();
    expect(screen.getByText('No open shift right now.')).toBeTruthy();
  });

  it('warns that a past Business Day is still open', () => {
    feed.pastOpen = [{ businessDate: '2026-10-07' }];
    mount();
    expect(screen.getByRole('status').textContent).toBe(
      'Business day Wed, 7 Oct still open. Close it on desktop.',
    );
  });

  it('still names an older open day when today is open too', () => {
    // Today's day is open (live Shift) AND two earlier days were never closed: the
    // shift status only names the newest open day, the day status lists them all.
    feed.pastOpen = [{ businessDate: '2026-10-08' }, { businessDate: '2026-10-06' }];
    mount();
    expect(screen.getByRole('status').textContent).toBe(
      'Business days Tue, 6 Oct, Thu, 8 Oct still open. Close them on desktop.',
    );
  });

  it('shows no banner when no past Business Day is open', () => {
    mount();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Shifts tab: history', () => {
  it('groups closed Shifts by Shift Business Date, newest first, with each day total', () => {
    mount();
    const today = screen.getByRole('region', { name: 'Today · Fri, 9 Oct' });
    const yesterday = screen.getByRole('region', { name: 'Thu, 8 Oct' });
    expect(
      screen
        .getAllByRole('region')
        .map((r) => r.getAttribute('aria-label'))
        .filter((l) => l !== 'Live shift'),
    ).toEqual(['Today · Fri, 9 Oct', 'Thu, 8 Oct']);
    expect(within(today).getAllByText('₹2,13,200')).toHaveLength(2); // day total + the row
    // Shift 2 opened on the 9th (3:30 am IST) but sits under the 8th, above Shift 1.
    expect(
      within(yesterday)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([expect.stringContaining('Shift 2'), expect.stringContaining('Shift 1')]);
    expect(within(yesterday).getByText('₹4,65,540')).toBeTruthy();
  });

  it('shows each row with its window, sales and variance badge', () => {
    mount();
    const today = screen.getByRole('region', { name: 'Today · Fri, 9 Oct' });
    expect(within(today).getByText('6:00 am – 1:52 pm')).toBeTruthy();
    expect(within(today).getByText('Attendants −₹340')).toBeTruthy();
    const yesterday = screen.getByRole('region', { name: 'Thu, 8 Oct' });
    expect(within(yesterday).getByText('Balanced')).toBeTruthy();
    expect(within(yesterday).getByText('Office count +₹120')).toBeTruthy();
  });

  it('has no share button on a row', () => {
    mount();
    expect(screen.queryByRole('button', { name: /share|pdf|download/i })).toBeNull();
  });

  it('says so when nothing has closed yet', () => {
    feed.summaries = [];
    mount();
    expect(screen.getByText('No closed shifts yet.')).toBeTruthy();
  });

  it('pages older days in', () => {
    feed.summaries = Array.from({ length: 12 }, (_, i) =>
      row(
        `s${i}`,
        `2026-09-${String(20 - i).padStart(2, '0')}`,
        1,
        `2026-09-${String(20 - i).padStart(2, '0')}T02:00:00Z`,
        `2026-09-${String(20 - i).padStart(2, '0')}T10:00:00Z`,
        closedSnapshot(),
      ),
    );
    mount();
    expect(screen.queryByRole('region', { name: /10 Sep/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show older days' }));
    expect(screen.getByRole('region', { name: /10 Sep/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show older days' })).toBeNull();
  });
});

describe('Shifts tab: history beyond the first page', () => {
  const dayRows = (n: number) =>
    Array.from({ length: n }, (_, i) => {
      const d = `2026-09-${String(30 - i).padStart(2, '0')}`;
      return row(`d${i}`, d, 1, `${d}T02:00:00Z`, `${d}T10:00:00Z`, closedSnapshot());
    });

  it('fetches further pages for "Show older days", never showing a half-loaded day', () => {
    feed.summaries = dayRows(25);
    feed.pageSize = 8; // 8 of 25 days per fetch
    mount();
    // The oldest loaded day (23 Sep) may be cut off by the page, so it is held back.
    expect(screen.getByRole('region', { name: /24 Sep/ })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /23 Sep/ })).toBeNull();
    for (let guard = 0; guard < 6; guard++) {
      const more = screen.queryByRole('button', { name: 'Show older days' });
      if (!more) break;
      fireEvent.click(more);
    }
    // All 25 days are reachable, down to the oldest (6 Sep).
    expect(screen.getByRole('region', { name: /\b6 Sep/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show older days' })).toBeNull();
  });
});

describe('ShiftSummaryPage entry (pushed by other pages, e.g. the DSSR)', () => {
  const mountPage = (shiftId: string) =>
    render(
      <ToastProvider>
        <NavProvider tabs={['shifts']}>
          <ShiftSummaryPage station={station} shiftId={shiftId} />
        </NavProvider>
      </ToastProvider>,
    );

  it('finds the summary by shift id alone', () => {
    mountPage('s-y2');
    expect(screen.getByRole('heading', { name: 'Shift 2 summary' })).toBeTruthy();
    expect(screen.getByText('Thu, 8 Oct · 3:30 am – 7:30 am')).toBeTruthy();
  });

  it('says so when the summary is not there', () => {
    mountPage('nope');
    expect(screen.getByText('This shift summary is not available.')).toBeTruthy();
  });

  it('reads a single summary by id, so a Shift beyond the first page still opens', () => {
    feed.pageSize = 1; // the history list holds one row; the target is the third
    mountPage('s-y1');
    expect(feed.byIdReads).toContain('s-y1');
    expect(screen.getByRole('heading', { name: 'Shift 1 summary' })).toBeTruthy();
    expect(screen.getByText('Thu, 8 Oct · 6:00 am – 1:52 pm')).toBeTruthy();
  });

  it('badges a locked Shift as Closed', () => {
    feed.summaries = [{ ...(HISTORY[0] as object), status: 'LOCKED' } as never];
    mountPage('s-today');
    expect(screen.getByText('Closed')).toBeTruthy();
    expect(screen.queryByText('Locked')).toBeNull();
  });
});

describe('Shift Summary page', () => {
  const openToday = async () => {
    mount();
    const today = screen.getByRole('region', { name: 'Today · Fri, 9 Oct' });
    fireEvent.click(within(today).getByRole('button'));
    await screen.findByRole('heading', { name: 'Shift 1 summary' });
  };

  it('opens from a history row with the Shift, its date, window and a Closed badge', async () => {
    await openToday();
    expect(screen.getByText('Fri, 9 Oct · 6:00 am – 1:52 pm')).toBeTruthy();
    expect(screen.getByText('Shift 20261009-1')).toBeTruthy(); // the name the PDF uses
    expect(screen.getByText('Closed')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Live shift' })).toBeNull();
  });

  it('headlines total sales and BOTH cash-variance levels, never summed', async () => {
    await openToday();
    expect(screen.getAllByText('Total sales').length).toBeGreaterThan(0);
    const card = screen.getByRole('group', { name: 'Cash variance' });
    expect(within(card).getByText('Attendants')).toBeTruthy();
    expect(within(card).getByText('−₹340')).toBeTruthy();
    expect(within(card).getByText('DU3 short')).toBeTruthy();
    expect(within(card).getByText('Office count')).toBeTruthy();
    expect(within(card).getByText('₹0')).toBeTruthy();
  });

  it('Morning of the report-compare fixture: the split adds up to ₹1,81,400', async () => {
    feed.summaries = [
      row(
        's-m',
        '2026-10-09',
        1,
        '2026-10-09T00:30:00Z',
        '2026-10-09T08:45:00Z',
        closedSnapshot({
          totalFuelSalesValue: 178070,
          totalSalesValue: 181400,
          productSales: { total: 3330, lines: [] },
          payments: { cash: 71275, upi: 58000, card: 27000, credit: 23000, omcCard: 2000 },
          attendantVariance: -125,
          officeCountVariance: 50,
          cashVariance: 50,
          drawers: [
            {
              attendantId: 'a1',
              duId: 'd1',
              duName: 'DU-1',
              attendantName: 'Ramesh Kumar',
              expectedCash: 6097.5,
              cashHandedOver: 5972.5,
              variance: -125,
            },
          ],
        }),
      ),
    ];
    mount();
    fireEvent.click(within(screen.getByRole('region', { name: /Today/ })).getByRole('button'));
    await screen.findByRole('heading', { name: 'Shift 1 summary' });
    const split = screen.getByText('OMC card').closest('div.rounded-\\[14px\\]') as HTMLElement;
    expect(within(split).getByText('₹2,000')).toBeTruthy();
    expect(within(split).getByText('Short').parentElement?.textContent).toContain('₹125');
    expect(within(split).getByText('Total sales').parentElement?.textContent).toContain(
      '₹1,81,400',
    );
    const card = screen.getByRole('group', { name: 'Cash variance' });
    expect(within(card).getByText('−₹125')).toBeTruthy();
    expect(within(card).getByText('+₹50')).toBeTruthy();
  });

  it('shows every section from the snapshot', async () => {
    await openToday();
    for (const name of ['Payments', 'Sales by product', 'Nozzle readings', 'Drawer reconciliation'])
      expect(screen.getByRole('heading', { name })).toBeTruthy();
    // payment split
    for (const method of ['Cash', 'UPI', 'Card', 'Credit'])
      expect(screen.getByText(method)).toBeTruthy();
    expect(screen.getByText('₹2,10,200')).toBeTruthy();
    // nozzle table: nozzle, DU · product, opening, closing, litres
    expect(screen.getByText('DU1 · MS')).toBeTruthy();
    expect(screen.getByText('1,84,220.4')).toBeTruthy();
    expect(screen.getByText('1,85,200.4')).toBeTruthy();
    // drawers: declared vs expected, variance badge, office count
    expect(screen.getByText('Declared ₹34,420')).toBeTruthy();
    expect(screen.getByText('₹31,460 of ₹31,800')).toBeTruthy();
    expect(screen.getByText('Office count vs declared')).toBeTruthy();
    expect(screen.getByText('Matched')).toBeTruthy();
  });

  it('handles a Shift with no product sales and no credit', async () => {
    await openToday();
    expect(screen.getByText('No product sales in this shift.')).toBeTruthy();
    // Credit is ₹0, not missing.
    expect(screen.getByText('Credit').parentElement?.textContent).toContain('₹0');
  });

  describe('with product sales in the snapshot', () => {
    const withProducts = () => {
      feed.summaries = [
        row(
          's-today',
          '2026-10-09',
          1,
          '2026-10-09T00:30:00Z',
          '2026-10-09T08:22:00Z',
          closedSnapshot({
            totalSalesValue: 214640,
            productSales: {
              total: 1440,
              lines: [
                {
                  productId: 'oil-a',
                  productName: 'Engine oil',
                  productType: 'LUBRICANT',
                  quantity: 4,
                  value: 900,
                },
                // Same name, different product and category: its own row.
                {
                  productId: 'oil-b',
                  productName: 'Engine oil',
                  productType: 'ACCESSORY',
                  quantity: 1,
                  value: 540,
                },
              ],
            },
          }),
        ),
      ];
    };

    it('adds them to the total and groups them by category (never merging by name)', async () => {
      withProducts();
      await openToday();
      expect(screen.getByText('Lubricants')).toBeTruthy();
      expect(screen.getByText('Accessories')).toBeTruthy();
      expect(screen.getByText('₹900')).toBeTruthy();
      expect(screen.getByText('₹540')).toBeTruthy();
      expect(screen.getAllByText('₹2,14,640').length).toBeGreaterThan(0);
      expect(screen.queryByText('No product sales in this shift.')).toBeNull();
    });

    it('shows the same total on the history row, the day total and the page', async () => {
      withProducts();
      mount();
      const today = screen.getByRole('region', { name: 'Today · Fri, 9 Oct' });
      // The day's total (section label) and the row.
      expect(within(today).getAllByText('₹2,14,640')).toHaveLength(2);
      fireEvent.click(within(today).getByRole('button'));
      await screen.findByRole('heading', { name: 'Shift 1 summary' });
      // The page leads with the very same figure.
      expect(screen.getAllByText('₹2,14,640').length).toBeGreaterThan(0);
    });
  });

  it('is honest about a summary saved before product sales were included', async () => {
    const { productSales: _p, totalSalesValue: _t, ...legacy } = closedSnapshot();
    feed.summaries = [
      row('s-today', '2026-10-09', 1, '2026-10-09T00:30:00Z', '2026-10-09T08:22:00Z', legacy),
    ];
    await openToday();
    expect(
      screen.getByText('This summary was saved before product sales were included.'),
    ).toBeTruthy();
    // Fuel alone is the total on both the row and the page.
    expect(screen.getAllByText('₹2,13,200').length).toBeGreaterThan(1);
  });

  it("takes each reading's Dispenser Unit from the snapshot, not from today's setup", async () => {
    feed.nozzles = [{ id: 'n1', duId: 'd9' }];
    feed.dispensers = [{ id: 'd9', name: 'DU9' }];
    await openToday();
    expect(screen.getByText('DU1 · MS')).toBeTruthy();
    expect(screen.queryByText('DU9 · MS')).toBeNull();
  });

  it('has no invented "Other" payment slice', async () => {
    await openToday();
    expect(screen.queryByText('Other')).toBeNull();
  });

  it('lets screen readers reach each Drawer’s DU name', async () => {
    await openToday();
    const chip = screen.getByText('DU3');
    expect(chip.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('has Share and Download PDF in the action bar, and no row-level share anywhere', async () => {
    await openToday();
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeTruthy();
  });

  it('Share hands the snapshot to the PDF generator via the share-capable saver, Download downloads', async () => {
    await openToday();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(feed.pdf).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(feed.pdf).toHaveLength(2));

    const [share, download] = feed.pdf;
    // (station, snapshot, shiftId, templateName, { businessDate, shiftSequence }, output)
    expect(share.slice(1, 5)).toEqual([
      HISTORY[0].snapshotData,
      's-today',
      'Shift 1',
      { businessDate: '2026-10-09', shiftSequence: 1 },
    ]);
    expect(share[5]).toBe('save');
    expect(download.slice(1, 5)).toEqual(share.slice(1, 5));
    expect(download[5]).toBe('download');
  });

  it('shows a legacy single-level snapshot with one cash variance line', async () => {
    feed.summaries = [
      row('s-old', '2026-10-09', 1, '2026-10-09T00:30:00Z', '2026-10-09T08:22:00Z', {
        totalFuelSalesValue: 5000,
        cashVariance: -80,
        closingCash: 1000,
        expectedCash: 1080,
      }),
    ];
    mount();
    fireEvent.click(within(screen.getByRole('region', { name: /Today/ })).getByRole('button'));
    await screen.findByRole('heading', { name: 'Shift 1 summary' });
    const card = screen.getByRole('group', { name: 'Cash variance' });
    expect(within(card).getByText('−₹80')).toBeTruthy();
    expect(within(card).queryByText('Attendants')).toBeNull();
    // One name for the single level on the header card and the Drawer section.
    expect(within(card).getByText('Counted cash')).toBeTruthy();
    expect(screen.getByText('Counted cash', { selector: 'p.text-\\[13px\\]' })).toBeTruthy();
    expect(screen.queryByText('Office count vs declared')).toBeNull();
  });
});

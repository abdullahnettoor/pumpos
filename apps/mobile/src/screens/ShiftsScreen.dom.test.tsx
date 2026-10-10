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
  summaries: [] as unknown[],
  nozzles: [] as unknown[],
  dispensers: [] as unknown[],
  handovers: [] as unknown[],
  billed: [] as unknown[],
  pdf: [] as unknown[][],
}));

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useShiftStatus: () => q(feed.status),
    useShiftSummaries: () => q(feed.summaries),
    useNozzles: () => q(feed.nozzles),
    useDispensers: () => q(feed.dispensers),
    useMerchandiseHandovers: () => q(feed.handovers),
    useMerchandiseSales: () => q(feed.billed),
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
  feed.handovers = [];
  feed.billed = [];
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
    feed.status = { ...liveStatus, businessDay: { status: 'OPEN', businessDate: '2026-10-07' } };
    mount();
    expect(screen.getByRole('status').textContent).toBe(
      'Business day Wed, 7 Oct still open. Close it on desktop.',
    );
  });

  it('shows no banner when the open Business Day is today', () => {
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
    expect(within(today).getByText('−₹340')).toBeTruthy();
    const yesterday = screen.getByRole('region', { name: 'Thu, 8 Oct' });
    expect(within(yesterday).getByText('Balanced')).toBeTruthy();
    expect(within(yesterday).getByText('+₹120')).toBeTruthy();
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

  it('badges a locked Shift as Locked', () => {
    feed.summaries = [{ ...(HISTORY[0] as object), status: 'LOCKED' }];
    mountPage('s-today');
    expect(screen.getByText('Locked')).toBeTruthy();
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

  it('headlines total sales and the cash variance, naming the DU', async () => {
    await openToday();
    expect(screen.getAllByText('Total sales').length).toBeGreaterThan(0);
    const headline = screen.getByText('Cash variance').parentElement as HTMLElement;
    expect(within(headline).getByText('−₹340')).toBeTruthy();
    expect(within(headline).getByText('DU3 short')).toBeTruthy();
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

  it("adds the Shift's product sales to the total and the product block", async () => {
    feed.handovers = [
      {
        totalAmount: '1180',
        items: [{ productId: 'oil', productName: 'Engine oil', quantity: '4', lineTotal: '1000' }],
      },
    ];
    feed.billed = [
      {
        totalAmount: '260',
        items: [{ productName: 'Coolant', quantity: '1', lineTotal: '260' }],
      },
    ];
    await openToday();
    expect(screen.getByText('Engine oil')).toBeTruthy();
    expect(screen.getByText('Coolant')).toBeTruthy();
    // 2,13,200 fuel + 1,440 products
    expect(screen.getAllByText('₹2,14,640').length).toBeGreaterThan(0);
    expect(screen.queryByText('No product sales in this shift.')).toBeNull();
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
    expect(screen.getByText('Cash variance', { selector: 'p.text-\\[13px\\]' })).toBeTruthy();
    expect(screen.queryByText('Office count vs declared')).toBeNull();
  });
});

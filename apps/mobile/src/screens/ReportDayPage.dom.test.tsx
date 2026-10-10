// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Station } from '@pump/shared';

/**
 * Screen tests for the DSSR page: Sealed reads the snapshot and Draft the
 * preview (banner only for Draft), the sections, ‹ › stepping across the list's
 * days (Live goes Home, older months load on demand), included Shifts opening
 * their Summary, and the Share / Download action bar. `@pump/ui` is the mock seam
 * for the reads and the PDF generator; everything else is real.
 */
const q = (data: unknown, extra: Record<string, unknown> = {}) => ({
  data,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  ...extra,
});

const feed = vi.hoisted(() => ({
  pages: [] as { days: { businessDate: string; status: string }[] }[],
  /** Pages the next fetchNextPage appends. */
  olderPages: [] as { days: { businessDate: string; status: string }[] }[],
  snapshots: {} as Record<string, unknown>,
  previews: {} as Record<string, unknown>,
  reads: [] as string[],
  pdf: [] as unknown[][],
  failPdf: false,
  /** fetchNextPage fails the way react-query does: it resolves with isError, hasNextPage unchanged. */
  failFetch: false,
  fetchNext: vi.fn(),
}));

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useBusinessDayList: () => {
      const [loaded, setLoaded] = React.useState(0);
      const pages = [...feed.pages, ...feed.olderPages.slice(0, loaded)];
      const hasNextPage = loaded < feed.olderPages.length;
      return {
        ...q({ pages }),
        hasNextPage,
        fetchNextPage: async () => {
          feed.fetchNext();
          if (feed.failFetch) {
            // Never loops for ever in a test: a regression fails after a few calls, not a hang.
            if (feed.fetchNext.mock.calls.length > 5) throw new Error('fetchNextPage retried');
            return {
              data: { pages: [...feed.pages, ...feed.olderPages.slice(0, loaded)] },
              hasNextPage: true,
              isError: true,
              error: new Error('offline'),
            };
          }
          const next = [...feed.pages, ...feed.olderPages.slice(0, loaded + 1)];
          setLoaded(loaded + 1);
          return { data: { pages: next }, hasNextPage: loaded + 1 < feed.olderPages.length };
        },
      };
    },
    useDailyDssr: (_s: string, date: string, opts?: { enabled?: boolean }) => {
      if (opts?.enabled !== false) feed.reads.push(`snapshot:${date}`);
      return opts?.enabled === false ? q(undefined) : q(feed.snapshots[date] ?? null);
    },
    useDailyDssrPreview: (_s: string, date: string, opts?: { enabled?: boolean }) => {
      if (opts?.enabled !== false) feed.reads.push(`preview:${date}`);
      return opts?.enabled === false ? q(undefined) : q(feed.previews[date] ?? null);
    },
    generateDssrPdf: async (...args: unknown[]) => {
      feed.pdf.push(args);
      if (feed.failPdf) throw new Error('No PDF today');
    },
  };
});
vi.mock('./ShiftSummaryPage.js', () => ({
  ShiftSummaryPage: ({ shiftId }: { shiftId: string }) => <p>Summary page {shiftId}</p>,
}));

const { ReportDayPage } = await import('./reports/ReportDayPage.js');
const { NavProvider, useNav } = await import('../shell/nav.js');
const { ToastProvider } = await import('@pump/ui');

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
} as unknown as Station;

const payload = (date: string, live: boolean) => ({
  businessDate: date,
  generatedAt: '2026-10-09T10:00:00Z',
  ...(live ? { live: true } : {}),
  snapshotData: {
    fuel: {
      totalSalesValue: 440653,
      byProduct: [
        {
          productId: 'p1',
          productName: 'Petrol',
          productCode: 'MS',
          unit: 'L',
          netVolume: 2210,
          salesValue: 227453,
        },
        {
          productId: 'p2',
          productName: 'Diesel',
          productCode: 'HSD',
          unit: 'L',
          netVolume: 2380,
          salesValue: 213200,
        },
      ],
    },
    merchandise: { salesValue: 6840 },
    pnl: {
      revenue: 447493,
      cogs: 420000,
      grossMargin: 20830,
      byProduct: [
        { kind: 'merchandise', productId: 'm1', name: 'Engine oil', quantity: 18, revenue: 6840 },
      ],
    },
    credit: { total: 48210, count: 6 },
    purchases: { total: 0, count: 0 },
    drawer: { totalCashVariance: 120, totalAttendantVariance: 0, attendants: [] },
    shifts: [
      {
        shiftId: 's1',
        shiftSequence: 1,
        templateName: 'Morning',
        closedAt: '2026-10-08T08:28:00Z',
        cashVariance: 120,
        netVolume: 2210,
        fuelSalesValue: 206530,
      },
      {
        shiftId: 's2',
        shiftSequence: 2,
        templateName: 'Evening',
        closedAt: '2026-10-08T16:34:00Z',
        cashVariance: 0,
        netVolume: 2380,
        fuelSalesValue: 234123,
      },
    ],
    fuelStockVariance: [
      {
        tankName: 'Tank 1',
        productName: 'Petrol',
        unit: 'Litre',
        expectedQuantity: 14820,
        actualQuantity: 14802,
        varianceQuantity: -18,
      },
    ],
  },
});

const Stage: React.FC = () => {
  const nav = useNav();
  const top = (nav.stacks[nav.active] ?? []).at(-1);
  return (
    <>
      <p data-testid="tab">{nav.active}</p>
      {top ? top.element : <ReportDayPage station={station} businessDate={start.date} />}
    </>
  );
};
const start = { date: '2026-10-08' };
const mount = (date: string, tabs: readonly ('reports' | 'home')[] = ['reports', 'home']) => {
  start.date = date;
  return render(
    <ToastProvider>
      <NavProvider tabs={tabs}>
        <Stage />
      </NavProvider>
    </ToastProvider>,
  );
};

beforeEach(() => {
  feed.pages = [
    {
      days: [
        { businessDate: '2026-10-09', status: 'LIVE' },
        { businessDate: '2026-10-08', status: 'DRAFT' },
        { businessDate: '2026-10-07', status: 'REPORT_MISSING' },
        { businessDate: '2026-10-06', status: 'SEALED' },
      ],
    },
  ];
  feed.snapshots = { '2026-10-06': payload('2026-10-06', false) };
  feed.previews = { '2026-10-08': payload('2026-10-08', true) };
});
afterEach(() => {
  cleanup();
  feed.olderPages = [];
  feed.reads = [];
  feed.pdf = [];
  feed.failPdf = false;
  feed.failFetch = false;
  feed.fetchNext.mockClear();
});

describe('ReportDayPage', () => {
  it('reads the preview for a Draft day and says the day is not closed', () => {
    mount('2026-10-08');
    expect(feed.reads).toContain('preview:2026-10-08');
    expect(feed.reads.filter((r) => r.startsWith('snapshot'))).toEqual([]);
    expect(screen.getByText('Draft · day not closed')).toBeTruthy();
    expect(screen.getByText(/can change until the day is closed on desktop/)).toBeTruthy();
    expect(screen.getByText('DSSR · Thu, 8 Oct')).toBeTruthy();
    expect(screen.getByText('2 Shifts · Highway Fuels')).toBeTruthy();
  });

  it('reads the immutable snapshot for a Sealed day, with no banner', () => {
    mount('2026-10-06');
    expect(feed.reads).toContain('snapshot:2026-10-06');
    expect(feed.reads.filter((r) => r.startsWith('preview'))).toEqual([]);
    expect(screen.queryByText('Draft · day not closed')).toBeNull();
    expect(screen.getByText('Sealed')).toBeTruthy();
  });

  it('shows the summary tiles, Sales by product, included Shifts and stock movement', () => {
    mount('2026-10-08');
    expect(screen.getByText('Gross margin')).toBeTruthy();
    expect(screen.getByText('Credit sales')).toBeTruthy();
    expect(screen.getByText('6 slips')).toBeTruthy();
    expect(screen.getByText('Purchases')).toBeTruthy();
    expect(screen.getByText('Total sales')).toBeTruthy();
    expect(screen.getByText('Engine oil')).toBeTruthy();
    expect(screen.getByText('Included Shifts')).toBeTruthy();
    expect(screen.getByText('Morning')).toBeTruthy();
    expect(screen.getByText('Closed 1:58 pm · 2,210 L')).toBeTruthy();
    expect(screen.getByText('Tank 1 · Petrol')).toBeTruthy();
    expect(screen.getByText('Book 14,820 → Dip 14,802 L')).toBeTruthy();
    expect(screen.getByText('Sold 2,210 L')).toBeTruthy();
    expect(screen.getByText('−18 L').className).toMatch(/text-bad-fg/);
  });

  it('shows each tank opening → closing, sold and the dip when the snapshot carries them', () => {
    const snap = payload('2026-10-06', false) as { snapshotData: Record<string, any> };
    snap.snapshotData.fuelStockVariance[0].tankMovement = {
      tankId: 't1',
      openingQuantity: 17030,
      receivedQuantity: 0,
      soldQuantity: 2210,
      adjustedQuantity: 0,
      closingQuantity: 14820,
    };
    feed.snapshots['2026-10-06'] = snap;
    mount('2026-10-06');
    expect(screen.getByText('Opening 17,030 → Closing 14,820 L')).toBeTruthy();
    expect(screen.getByText('Sold 2,210 L · Dip 14,802 L')).toBeTruthy();
    expect(screen.getByText('−18 L').className).toMatch(/text-bad-fg/);
  });

  it('opens a Shift Summary from an included Shift', () => {
    mount('2026-10-08');
    fireEvent.click(screen.getByText('Evening'));
    expect(screen.getByText('Summary page s2')).toBeTruthy();
  });

  it('has no Close-day action', () => {
    mount('2026-10-08');
    expect(screen.queryByText(/close day/i)).toBeNull();
  });

  describe('day stepping', () => {
    it('steps older, skipping a Report-missing day, and reads that day', () => {
      mount('2026-10-08');
      fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
      expect(screen.getByText('DSSR · Tue, 6 Oct')).toBeTruthy();
      expect(feed.reads).toContain('snapshot:2026-10-06');
      expect(
        (screen.getByRole('button', { name: 'Previous day' }) as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    it('steps newer into the Live day as Home, not as a DSSR', () => {
      mount('2026-10-08');
      fireEvent.click(screen.getByRole('button', { name: 'Next day (today, opens Home)' }));
      expect(screen.getByTestId('tab').textContent).toBe('home');
      expect(feed.reads.some((r) => r.endsWith('2026-10-09'))).toBe(false);
    });

    it('disables newer when Home is not reachable', () => {
      mount('2026-10-08', ['reports']);
      expect((screen.getByRole('button', { name: /Next day/ }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });

    it('loads the next older month when the loaded days run out', async () => {
      feed.olderPages = [{ days: [{ businessDate: '2026-09-30', status: 'SEALED' }] }];
      feed.snapshots['2026-09-30'] = payload('2026-09-30', false);
      mount('2026-10-06');
      fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
      await waitFor(() => expect(screen.getByText(/^DSSR · Wed, 30 Sep/)).toBeTruthy());
      expect(feed.fetchNext).toHaveBeenCalledTimes(1);
    });
  });

  it('stops and says so when an older month fails to load, instead of retrying for ever', async () => {
    feed.olderPages = [{ days: [{ businessDate: '2026-09-30', status: 'SEALED' }] }];
    feed.failFetch = true;
    mount('2026-10-06');
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await waitFor(() => expect(screen.getByText('Could not load older days.')).toBeTruthy());
    expect(feed.fetchNext).toHaveBeenCalledTimes(1);
    expect(screen.getByText('DSSR · Tue, 6 Oct')).toBeTruthy();
    // The button is usable again, and a retry that now succeeds steps back.
    feed.failFetch = false;
    feed.snapshots['2026-09-30'] = payload('2026-09-30', false);
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await waitFor(() => expect(screen.getByText(/^DSSR · Wed, 30 Sep/)).toBeTruthy());
  });

  describe('action bar', () => {
    it('shares and downloads the same PDF payload, marked draft for a Draft day', async () => {
      mount('2026-10-08');
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
      await waitFor(() => expect(feed.pdf.length).toBe(1));
      fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
      await waitFor(() => expect(feed.pdf.length).toBe(2));
      const [stationArg, dssr, output] = feed.pdf[0] as [unknown, Record<string, unknown>, string];
      expect(stationArg).toBe(station);
      expect(dssr).toMatchObject({ businessDate: '2026-10-08', draft: true });
      expect(output).toBe('save');
      expect(feed.pdf[1][2]).toBe('download');
    });

    it('leaves a Sealed PDF unmarked', async () => {
      mount('2026-10-06');
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
      await waitFor(() => expect(feed.pdf.length).toBe(1));
      expect((feed.pdf[0][1] as Record<string, unknown>).draft).toBe(false);
    });

    it('reports a failed PDF instead of failing silently', async () => {
      feed.failPdf = true;
      mount('2026-10-06');
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
      await waitFor(() => expect(screen.getByText('No PDF today')).toBeTruthy());
    });
  });

  describe('states without a DSSR', () => {
    it('sends a Live day to Home instead of showing a report', () => {
      mount('2026-10-09');
      expect(screen.getByText(/still live, so it has no DSSR/)).toBeTruthy();
      expect(feed.reads).toEqual([]);
      expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'See Home' }));
      expect(screen.getByTestId('tab').textContent).toBe('home');
    });

    it('says a Report-missing day has no DSSR, and offers no actions', () => {
      mount('2026-10-07');
      expect(screen.getByText('No DSSR for this day.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    });

    it('says so when the day has no report to read', () => {
      feed.snapshots = {};
      mount('2026-10-06');
      expect(screen.getByText('This DSSR is not available.')).toBeTruthy();
      expect(within(document.body).queryByRole('button', { name: 'Share' })).toBeNull();
    });
  });
});

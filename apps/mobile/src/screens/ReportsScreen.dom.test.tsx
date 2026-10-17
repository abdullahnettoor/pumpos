// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Role, Station } from '@pump/shared';
import type { TabKey } from '../lib/tabKey.js';
import { tabsForRole } from '../shell/tabs.js';

const feed = vi.hoisted(() => ({
  pages: [] as unknown[],
  hasNext: false,
  error: false,
  fetchNext: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useBusinessDayList: () => ({
      data: feed.error ? undefined : { pages: feed.pages },
      isLoading: false,
      isError: feed.error,
      refetch: feed.refetch,
      hasNextPage: feed.hasNext,
      isFetchingNextPage: false,
      fetchNextPage: feed.fetchNext,
    }),
  };
});
vi.mock('./reports/ReportDayPage.js', () => ({
  ReportDayPage: ({ businessDate }: { businessDate: string }) => <p>DSR for {businessDate}</p>,
}));

vi.mock('./decantation/DecantationsListPage.js', () => ({
  DecantationsListPage: () => <p>Decantations list</p>,
}));
vi.mock('./density/DensityPage.js', () => ({ DensityPage: () => <p>Density page</p> }));

const { ReportsScreen } = await import('./ReportsScreen.js');
const { NavProvider, useNav } = await import('../shell/nav.js');
const { ShellContext } = await import('../shell/context.js');

const station = { id: 'st-1', name: 'Highway Fuels' } as unknown as Station;
const day = (businessDate: string, status: string, totalSales: number, cashVariance = 0) => ({
  businessDate,
  status,
  totalSales,
  fuelSales: totalSales,
  productSales: 0,
  volume: 4752,
  cashVariance,
  shiftCount: 2,
});

const Stage: React.FC = () => {
  const nav = useNav();
  const top = (nav.stacks[nav.active] ?? []).at(-1);
  return (
    <>
      <p data-testid="tab">{nav.active}</p>
      {top ? top.element : <ReportsScreen station={station} />}
    </>
  );
};
const mount = (tabs: readonly TabKey[] = ['reports', 'home'], role: Role = 'Owner') =>
  render(
    <ShellContext.Provider
      value={{ station, stationName: 'x', userName: 'A', role, openAccount: () => {} }}
    >
      <NavProvider tabs={tabs}>
        <Stage />
      </NavProvider>
    </ShellContext.Provider>,
  );

afterEach(() => {
  cleanup();
  feed.pages = [];
  feed.hasNext = false;
  feed.error = false;
  feed.refetch.mockClear();
  feed.fetchNext.mockClear();
});

const seed = () => {
  feed.pages = [
    {
      month: '2026-10',
      week: {
        total: 3196000,
        sealedDays: 7,
        comparison: { total: 3196000, previousTotal: 3003000, days: 7 },
        openPastDays: 2,
      },
      olderMonth: '2026-09',
      days: [
        day('2026-10-09', 'LIVE', 0),
        day('2026-10-08', 'DRAFT', 46600, 120),
        day('2026-10-07', 'DRAFT', 51800, -1250),
        day('2026-10-06', 'SEALED', 47000),
      ],
    },
  ];
};

describe('ReportsScreen', () => {
  it('shows the week tiles and the month list with statuses and cash variance', () => {
    seed();
    mount();
    expect(screen.getByText('Last 7 days')).toBeTruthy();
    expect(screen.getByText(/6\.4% vs previous 7/)).toBeTruthy();
    expect(screen.getByText('2 days')).toBeTruthy();
    expect(screen.getByText('8 Oct & 7 Oct')).toBeTruthy();
    expect(screen.getByText('October 2026')).toBeTruthy();
    expect(screen.getByText('Cash −₹1,250')).toBeTruthy();
    expect(screen.getByText('Cash balanced')).toBeTruthy();
  });

  it('shows a Live day as In progress, never a partial total that disagrees with Home', () => {
    seed();
    feed.pages = [
      {
        ...(feed.pages[0] as object),
        days: [day('2026-10-09', 'LIVE', 21500)],
      },
    ];
    mount();
    const row = screen.getByRole('button', { name: /^Fri 9 Oct, Open/ });
    expect(row.getAttribute('aria-label')).toBe('Fri 9 Oct, Open, In progress, See Home');
    expect(within(row).getByText('In progress')).toBeTruthy();
    expect(within(row).getByText('See Home')).toBeTruthy();
    expect(row.textContent).not.toContain('21,500');
    expect(row.textContent).not.toContain('21.5');
  });

  describe('a Live day per Role', () => {
    const liveOnly = () => {
      seed();
      feed.pages = [{ ...(feed.pages[0] as object), days: [day('2026-10-09', 'LIVE', 21500)] }];
    };

    it('opens Home for a Manager, as for an Owner', () => {
      liveOnly();
      mount(tabsForRole('Manager', false));
      const row = screen.getByRole('button', { name: /^Fri 9 Oct, Open/ });
      expect(within(row).getByText('See Home')).toBeTruthy();
      fireEvent.click(row);
      expect(screen.getByTestId('tab').textContent).toBe('home');
    });

    it('opens Shifts for a dock that has Shifts but no Home', () => {
      liveOnly();
      mount(['shifts', 'reports', 'money', 'insights']);
      const row = screen.getByRole('button', { name: /^Fri 9 Oct, Open/ });
      expect(within(row).getByText('See Shifts')).toBeTruthy();
      fireEvent.click(row);
      expect(screen.getByTestId('tab').textContent).toBe('shifts');
    });

    it('is not tappable for an Accountant (no Home or Shifts), and says the day is in progress', () => {
      liveOnly();
      mount(['reports', 'money']);
      expect(screen.queryByRole('button', { name: /^Fri 9 Oct, Open/ })).toBeNull();
      const row = screen.getByRole('group', { name: /^Fri 9 Oct, Open/ });
      expect(within(row).getByText('Day in progress')).toBeTruthy();
      expect(screen.getByTestId('tab').textContent).toBe('reports');
    });
  });

  it('compacts the tile figure only; a day row shows and speaks the exact amount', () => {
    seed();
    mount();
    const tile = screen.getByText('Last 7 days').parentElement!;
    expect(within(tile).getByText('₹31.96L')).toBeTruthy();
    const row = screen.getByRole('button', { name: /^Wed 7 Oct, Draft/ });
    expect(within(row).getByText('₹51,800')).toBeTruthy();
    expect(row.getAttribute('aria-label')).not.toMatch(/₹[\d.]+(k|L|Cr)\b/);
  });

  it('gives each row a label that carries its figures, with the decoration hidden', () => {
    seed();
    mount();
    const row = screen.getByRole('button', { name: /^Wed 7 Oct, Draft/ });
    expect(row.getAttribute('aria-label')).toBe('Wed 7 Oct, Draft, ₹51,800, 4,752 L, Cash −₹1,250');
    // The chevron and the bar are decorative.
    expect(row.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2);
  });

  it('hides the arrow glyph from assistive tech and speaks the direction', () => {
    seed();
    mount();
    const glyph = screen.getByText('▲');
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
    expect(glyph.parentElement?.textContent).toContain('Up');
  });

  it('routes Live to Home', () => {
    seed();
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Fri 9 Oct, Open/ }));
    expect(screen.getByTestId('tab').textContent).toBe('home');
  });

  it('opens the DSR for a Draft day', () => {
    seed();
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Thu 8 Oct, Draft/ }));
    expect(screen.getByText('DSR for 2026-10-08')).toBeTruthy();
    expect(screen.getByTestId('tab').textContent).toBe('reports');
  });

  it('opens the DSR for a Sealed day', () => {
    seed();
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Tue 6 Oct, Sealed/ }));
    expect(screen.getByText('DSR for 2026-10-06')).toBeTruthy();
  });

  it('shows a closed day without a DSR snapshot as Report missing and does not open it', () => {
    seed();
    feed.pages = [
      {
        ...(feed.pages[0] as object),
        days: [day('2026-10-05', 'REPORT_MISSING', 0)],
      },
    ];
    mount();
    expect(screen.queryByText('Sealed')).toBeNull();
    const row = screen.getByRole('group', { name: /^Mon 5 Oct, Report missing/ });
    expect(within(row).getByText('Report missing')).toBeTruthy();
    expect(within(row).getByText('No DSR for this day')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Mon 5 Oct/ })).toBeNull();
    fireEvent.click(row);
    expect(screen.queryByText(/^DSR for \d/)).toBeNull();
    expect(screen.getByTestId('tab').textContent).toBe('reports');
  });

  it('scales the bars across every loaded month, not each month alone', () => {
    seed();
    feed.pages = [
      {
        month: '2026-10',
        week: { ...((feed.pages[0] as { week: object }).week as object) },
        olderMonth: '2026-09',
        days: [day('2026-10-06', 'SEALED', 250)],
      },
      { month: '2026-09', week: {}, olderMonth: null, days: [day('2026-09-30', 'SEALED', 500)] },
    ];
    mount();
    const fill = (name: RegExp) =>
      (
        screen.getByRole('button', { name }).querySelector('[aria-hidden="true"] > div') as
          HTMLElement | undefined
      )?.style.width;
    expect(fill(/^Tue 6 Oct/)).toBe('50%');
    expect(fill(/^Wed 30 Sep/)).toBe('100%');
  });

  it('offers a retry, announced as an alert, when the list fails to load', () => {
    feed.error = true;
    mount();
    expect(screen.getByRole('alert').textContent).toContain('Couldn’t load the business days');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(feed.refetch).toHaveBeenCalled();
  });

  it('loads older months on demand', () => {
    seed();
    feed.hasNext = true;
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Load older months' }));
    expect(feed.fetchNext).toHaveBeenCalled();
  });

  it.each(['Owner', 'Manager', 'Accountant'] as const)(
    'gives %s Decantations and Density entries',
    (role) => {
      seed();
      mount(['reports'], role);
      fireEvent.click(screen.getByRole('button', { name: /Decantations/ }));
      expect(screen.getByText('Decantations list')).toBeTruthy();
      cleanup();
      mount(['reports'], role);
      fireEvent.click(screen.getByRole('button', { name: /Density/ }));
      expect(screen.getByText('Density page')).toBeTruthy();
    },
  );

  it('gives Staff the Density entry but not Decantations', () => {
    seed();
    mount(['reports'], 'Staff');
    expect(screen.queryByRole('button', { name: /Decantations/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Density/ }));
    expect(screen.getByText('Density page')).toBeTruthy();
  });

  it('hides both entries from Attendant', () => {
    seed();
    mount(['reports'], 'Attendant');
    expect(screen.queryByRole('button', { name: /Decantations/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Density/ })).toBeNull();
  });
});

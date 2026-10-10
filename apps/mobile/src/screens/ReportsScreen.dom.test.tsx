// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Station } from '@pump/shared';

const feed = vi.hoisted(() => ({ pages: [] as unknown[], hasNext: false, fetchNext: vi.fn() }));

vi.mock('@pump/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useBusinessDayList: () => ({
      data: { pages: feed.pages },
      isLoading: false,
      isError: false,
      hasNextPage: feed.hasNext,
      isFetchingNextPage: false,
      fetchNextPage: feed.fetchNext,
    }),
  };
});
vi.mock('./DssrScreen.js', () => ({
  DssrScreen: ({ businessDate }: { businessDate: string }) => <p>DSSR for {businessDate}</p>,
}));

const { ReportsScreen } = await import('./ReportsScreen.js');
const { NavProvider, useNav } = await import('../shell/nav.js');

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
const mount = () =>
  render(
    <NavProvider tabs={['reports', 'home']}>
      <Stage />
    </NavProvider>,
  );

afterEach(() => {
  cleanup();
  feed.pages = [];
  feed.hasNext = false;
});

const seed = () => {
  feed.pages = [
    {
      month: '2026-10',
      week: { total: 3196000, previousTotal: 3003000, openPastDays: 2 },
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
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.getByText('▲ 6.4% vs last')).toBeTruthy();
    expect(screen.getByText('2 days')).toBeTruthy();
    expect(screen.getByText('8 Oct & 7 Oct')).toBeTruthy();
    expect(screen.getByText('October 2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fri 9 Oct, Live' })).toBeTruthy();
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByText('See Home')).toBeTruthy();
    expect(screen.getByText('Cash −₹1,250')).toBeTruthy();
    expect(screen.getByText('Cash balanced')).toBeTruthy();
  });

  it('routes Live to Home', () => {
    seed();
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Fri 9 Oct, Live' }));
    expect(screen.getByTestId('tab').textContent).toBe('home');
  });

  it('opens the daily report for a Draft or Sealed day', () => {
    seed();
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Tue 6 Oct, Sealed' }));
    expect(screen.getByText('DSSR for 2026-10-06')).toBeTruthy();
    expect(screen.getByTestId('tab').textContent).toBe('reports');
  });

  it('loads older months on demand', () => {
    seed();
    feed.hasNext = true;
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Load older months' }));
    expect(feed.fetchNext).toHaveBeenCalled();
  });
});

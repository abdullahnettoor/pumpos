// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Station } from '@pump/shared';
import { renderWithProviders } from '../../../test/renderWithProviders.js';

const hooks = vi.hoisted(() => ({
  usePricing: vi.fn(),
  useDensityTodaySummary: vi.fn(),
  useInventoryStatus: vi.fn(),
}));
vi.mock('../../../query/hooks.js', () => hooks);

import { FuelsCard } from './FuelsCard.js';
import { DashboardProvider } from '../frame/DashboardContext.js';

const STATION = {
  id: 'st-1',
  name: 'H',
  settings: { densityToleranceKgM3: 3 },
} as unknown as Station;
const D = '2026-10-12';
const q = (data: unknown, extra = {}) => ({
  data,
  isPending: false,
  isError: false,
  refetch: vi.fn(),
  ...extra,
});
const pending = { data: undefined, isPending: true, isError: false, refetch: vi.fn() };
const failed = { data: undefined, isPending: false, isError: true, refetch: vi.fn() };

const PRICES = [
  {
    productId: 'p1',
    productName: 'Petrol',
    productCode: 'MS',
    price: 104.5,
    effectiveFrom: '2026-10-01T00:00:00Z',
  },
];
const reading = (d: number, kind = 'MORNING') =>
  ({
    density15: d,
    kind,
    businessDate: D,
    entryDate: D,
    observedTempC: 30,
    recordedAt: '2026-10-12T01:00:00Z',
  }) as any;
const dens = (over: object) =>
  q({
    businessDate: D,
    entryDate: D,
    products: [
      {
        productId: 'p1',
        productName: 'Petrol',
        productCode: 'MS',
        latestToday: null,
        todayRecorded: false,
        trend14d: [],
        trendValues: [],
        lastReadings: [],
        ...over,
      },
    ],
  });
const TREND = [
  { date: '2026-10-11', density15: 740 },
  { date: D, density15: 741 },
];
const TANK = {
  id: 't1',
  name: 'T1',
  productId: 'p1',
  capacity: 20000,
  currentVolume: 12000,
  daysOfCover: 3.4,
  waitingOnDecantation: false,
};

const nav = vi.fn();
const mount = (role: 'Owner' | 'Manager' | 'Accountant' | 'Staff' = 'Owner') =>
  renderWithProviders(
    <DashboardProvider
      value={{
        station: STATION,
        role,
        userName: 'A',
        now: new Date(),
        timeZone: 'Asia/Kolkata',
        dayStartsAt: '06:00',
        businessDate: D,
        entryDate: D,
        onNavigate: nav,
      }}
    >
      <FuelsCard />
    </DashboardProvider>,
  );

beforeEach(() => {
  hooks.usePricing.mockReturnValue(q(PRICES));
  hooks.useDensityTodaySummary.mockReturnValue(
    dens({ latestToday: reading(741), trend14d: TREND, trendValues: [740, 741] }),
  );
  hooks.useInventoryStatus.mockReturnValue(q([TANK]));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FuelsCard', () => {
  it('shows header, density with change and tank cover', () => {
    mount();
    expect(screen.getByText('Petrol')).toBeTruthy();
    expect(screen.getByText(/₹104\.50\/L/)).toBeTruthy();
    expect(screen.getByText(/\+1\.0 vs yesterday/)).toBeTruthy();
    expect(screen.getByText('60%')).toBeTruthy();
    expect(screen.getByText('3.4 days cover')).toBeTruthy();
    expect(screen.getByTestId('fuel-MS').dataset.alert).toBe('false');
  });

  it('flags an unexplained jump with a red outline', () => {
    hooks.useDensityTodaySummary.mockReturnValue(
      dens({ latestToday: reading(748), trend14d: TREND, trendValues: [740, 748] }),
    );
    mount();
    expect(screen.getByText('Unexplained jump')).toBeTruthy();
    expect(screen.getByTestId('fuel-MS').dataset.alert).toBe('true');
  });

  it('first day: no change shown', () => {
    hooks.useDensityTodaySummary.mockReturnValue(
      dens({
        latestToday: reading(741),
        trend14d: [{ date: D, density15: 741 }],
        trendValues: [741],
      }),
    );
    mount();
    expect(screen.getByText(/first reading/)).toBeTruthy();
  });

  it('not recorded offers Record to Owner and navigates', () => {
    hooks.useDensityTodaySummary.mockReturnValue(dens({}));
    mount('Owner');
    expect(screen.getByText('Not recorded')).toBeTruthy();
    fireEvent.click(screen.getByText('Record ›'));
    expect(nav).toHaveBeenCalledWith('/inventory', { focusInventoryTab: 'density' });
  });

  it.each(['Accountant', 'Staff'] as const)('not recorded hides Record for %s', (role) => {
    hooks.useDensityTodaySummary.mockReturnValue(dens({}));
    mount(role);
    expect(screen.getByText('Not recorded')).toBeTruthy();
    expect(screen.queryByText('Record ›')).toBeNull();
  });

  it('no sales history falls back to the cover note; low tank outlines red', () => {
    hooks.useInventoryStatus.mockReturnValue(
      q([{ ...TANK, currentVolume: 4000, daysOfCover: null }]),
    );
    mount();
    expect(screen.getByText('cover after 7 days of sales')).toBeTruthy();
    expect(screen.getByTestId('fuel-MS').dataset.alert).toBe('true');
  });

  it('pending decantation: Decant for Manager, not Staff; Plan purchase gated', () => {
    hooks.useInventoryStatus.mockReturnValue(q([{ ...TANK, waitingOnDecantation: true }]));
    mount('Manager');
    expect(screen.getByText(/Decantation pending/)).toBeTruthy();
    expect(screen.getByText('Decant ›')).toBeTruthy();
    expect(screen.getByText('Plan purchase ›')).toBeTruthy();
    fireEvent.click(screen.getByText('Decant ›'));
    expect(nav).toHaveBeenCalledWith('/inventory', { focusInventoryTab: 'decantations' });
    fireEvent.click(screen.getByText('Plan purchase ›'));
    expect(nav).toHaveBeenCalledWith('/purchases', { openNewPurchase: true });
    cleanup();
    mount('Staff');
    expect(screen.getByText(/Decantation pending/)).toBeTruthy();
    expect(screen.queryByText('Decant ›')).toBeNull();
    expect(screen.queryByText('Plan purchase ›')).toBeNull();
  });

  it('parts load and fail independently', () => {
    hooks.useDensityTodaySummary.mockReturnValue(failed);
    hooks.useInventoryStatus.mockReturnValue(pending);
    mount();
    expect(screen.getByText(/Couldn't load density/)).toBeTruthy();
    expect(screen.getByText('Petrol')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(failed.refetch).toHaveBeenCalled();
  });

  it('card-level loading and error come from pricing', () => {
    hooks.usePricing.mockReturnValue(failed);
    mount();
    expect(screen.getByRole('alert').textContent).toMatch(/Couldn't load fuels/);
  });

  it('queries are not enabled when nothing is gated off for the role (enabled true) ', () => {
    mount('Owner');
    expect(hooks.usePricing).toHaveBeenCalledWith('st-1', { enabled: true });
  });
});

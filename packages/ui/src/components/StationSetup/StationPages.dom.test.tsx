// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';
import { FuelPricingPanel } from './FuelPricingPanel.js';
import { StationOverview } from './StationOverview.js';

/**
 * Station and Pricing page frames (#537 review): one stable page primary,
 * Data Sections bound to every query they read, and price changes keyed and
 * read on the station's clock.
 */

vi.mock('../../access/CapabilityGate.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCapability: () => ({ status: 'enabled' }),
}));

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  code: 'HF',
  onboardingStatus: 'READY_FOR_OPERATIONS',
  settings: { timezone: 'Asia/Dubai', business_day_starts_at: '06:00' },
} as any;

type Route = { status?: number; data?: unknown; message?: string };
let routes: Record<string, Route>;
const calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  calls.length = 0;
  routes = {
    '/setup/stations': { data: [station] },
    '/setup/products': {
      data: [
        { id: 'p-ms', code: 'MS', name: 'Petrol', productType: 'FUEL', isActive: true, unit: 'L' },
      ],
    },
    '/setup/pricing/history': {
      data: [
        {
          id: 'h1',
          productId: 'p-ms',
          productName: 'Petrol',
          price: '100',
          effectiveFrom: '2026-09-01T00:00:00Z',
        },
        {
          id: 'h2',
          productId: 'p-ms',
          productName: 'Petrol',
          price: '102.5',
          effectiveFrom: '2026-10-01T00:00:00Z',
        },
      ],
    },
    '/setup/pricing': {
      data: [
        {
          productId: 'p-ms',
          productName: 'Petrol',
          productCode: 'MS',
          price: 102.5,
          effectiveFrom: '2026-10-01T00:00:00Z',
        },
      ],
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const path = new URL(url, 'http://x').pathname.replace(/^\/api/, '');
      const route =
        init?.method && init.method !== 'GET'
          ? { data: { id: 'new' } }
          : (routes[path] ?? { data: [] });
      const status = route.status ?? 200;
      const body =
        status >= 400
          ? { success: false, error: { code: 'SERVER_ERROR', message: route.message ?? 'boom' } }
          : { success: true, data: route.data };
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const header = (init: RequestInit | undefined, name: string) =>
  (init?.headers as Record<string, string> | undefined)?.[name];

describe('Station page', () => {
  it('has one Add ▾ primary for Owners and Managers, none for read-only roles', async () => {
    const { unmount } = renderWithProviders(
      <StationOverview selectedStation={station} userRole="Manager" onStationSelected={() => {}} />,
    );
    const add = await screen.findByRole('button', { name: 'Add' });
    expect(add.getAttribute('aria-haspopup')).toBe('menu');
    unmount();

    renderWithProviders(
      <StationOverview
        selectedStation={station}
        userRole="Accountant"
        onStationSelected={() => {}}
      />,
    );
    await screen.findByRole('tab', { name: 'General' });
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
  });

  it('a failed station list shows Retry, not "No station selected"', async () => {
    routes['/setup/stations'] = { status: 500 };
    renderWithProviders(
      <StationOverview selectedStation={null} userRole="Owner" onStationSelected={() => {}} />,
    );
    expect(await screen.findByText(/Couldn't load stations/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByText('No station selected')).toBeNull();
  });
});

describe('Pricing page', () => {
  it('Change price is the page primary on both tabs and records under a key, on the station clock', async () => {
    renderWithProviders(<FuelPricingPanel selectedStation={station} />);
    await screen.findByText('₹100.00 → ₹102.50');
    fireEvent.click(screen.getByRole('tab', { name: /Products/ }));
    const primary = screen.getByRole('button', { name: 'Change price' });
    fireEvent.click(primary);

    fireEvent.change(await screen.findByPlaceholderText('e.g. 96.43'), {
      target: { value: '105' },
    });
    expect(screen.getByText('Station time (Asia/Dubai)')).toBeTruthy();
    fireEvent.change(document.querySelector('input[type="datetime-local"]')!, {
      target: { value: '2026-10-16T06:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply new rate' }));

    await waitFor(() => expect(calls.some((c) => c.init?.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.init?.method === 'POST')!;
    expect(header(post.init, 'Idempotency-Key')).toBeTruthy();
    // 06:00 in Dubai (UTC+4) is 02:00 UTC, whatever the browser's zone.
    expect(JSON.parse(String(post.init!.body))).toMatchObject({
      stationId: 'st-1',
      productId: 'p-ms',
      price: 105,
      effectiveFrom: '2026-10-16T02:00:00.000Z',
    });
  });

  it('a failed products request puts the fuel prices behind Retry, not a guessed unit', async () => {
    routes['/setup/products'] = { status: 500 };
    renderWithProviders(<FuelPricingPanel selectedStation={station} />);
    expect(await screen.findByText(/Couldn't load fuel prices/)).toBeTruthy();
    expect(screen.queryByText(/102\.50\/L/)).toBeNull();
  });
});

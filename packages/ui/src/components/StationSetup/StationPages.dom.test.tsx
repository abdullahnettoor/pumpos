// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { __resetUnsavedChangesForTests } from '../../pump-ds/form/unsavedChanges.js';
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

let saved: Record<string, unknown>;
let version = 0;

beforeEach(() => {
  calls.length = 0;
  saved = { ...station };
  version = 0;
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
      // A station PUT behaves like the server: the body over the saved
      // station, with a newer updatedAt.
      if (init?.method === 'PUT' && path.startsWith('/setup/stations/')) {
        saved = {
          ...saved,
          ...JSON.parse(String(init.body)),
          updatedAt: `2026-10-15T00:00:${String(++version).padStart(2, '0')}Z`,
        };
      }
      const route =
        init?.method === 'PUT' && path.startsWith('/setup/stations/')
          ? { data: saved }
          : init?.method && init.method !== 'GET'
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
  __resetUnsavedChangesForTests();
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

  it('Station details is an in-page form: the unsaved-changes bar shows only while it differs (#604)', async () => {
    const onStationSelected = vi.fn();
    renderWithProviders(
      <StationOverview
        selectedStation={station}
        userRole="Owner"
        onStationSelected={onStationSelected}
      />,
    );
    const form = await screen.findByRole('form', { name: 'Station details' });
    expect(screen.queryByRole('button', { name: 'Edit details' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
    const name = within(form).getByLabelText(/Station name/) as HTMLInputElement;
    // Onboarding status is a read-only chip, not a field.
    expect(screen.getByText('Ready for operations')).toBeTruthy();
    expect(within(form).queryByRole('combobox', { name: /Onboarding/ })).toBeNull();
    // While the form is changed, the bar's Save is the one primary: Add demotes.
    expect(screen.getByRole('button', { name: 'Add' }).className).toContain('bg-brand');

    fireEvent.change(name, { target: { value: 'Highway Fuels 2' } });
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' }).className).not.toContain('bg-brand');
    // Switching tab asks first.
    fireEvent.click(screen.getByRole('tab', { name: 'Branding' }));
    expect(
      await screen.findByRole('alertdialog', { name: 'Discard unsaved changes?' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('tab', { name: 'General' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(name.value).toBe('Highway Fuels');
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();

    fireEvent.change(name, { target: { value: 'Highway Fuels 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.init?.method === 'PUT')!;
    expect(header(put.init, 'Idempotency-Key')).toBeTruthy();
    expect(JSON.parse(String(put.init!.body))).toMatchObject({ name: 'Highway Fuels 2' });
    await waitFor(() => expect(onStationSelected).toHaveBeenCalled());
  });

  it('Rules saves both changed sections, the second built on the first (#604 review)', async () => {
    renderWithProviders(
      <StationOverview selectedStation={station} userRole="Owner" onStationSelected={() => {}} />,
    );
    fireEvent.click(await screen.findByRole('tab', { name: 'Rules' }));
    fireEvent.change(await screen.findByLabelText(/Critical below/), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Settling time (minutes)'), {
      target: { value: '45' },
    });
    expect(screen.getByText('2 sections changed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const puts = () => calls.filter((c) => c.init?.method === 'PUT');
    await waitFor(() => expect(puts()).toHaveLength(2));
    const bodies = puts().map((c) => JSON.parse(String(c.init!.body)));
    // The decantation body carries the tank levels just saved, not the stale prop's.
    expect(bodies[1].settings).toMatchObject({
      tankLevels: { criticalBelowPct: 15 },
      settlingTimeMinutes: 45,
    });
    expect(saved.settings).toMatchObject({
      tankLevels: { criticalBelowPct: 15 },
      settlingTimeMinutes: 45,
    });
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull(),
    );
    // Keys: one per section.
    const keys = puts().map((c) => header(c.init, 'Idempotency-Key'));
    expect(new Set(keys).size).toBe(2);
  });

  it('a grace period of 0 survives a save (#604 review)', async () => {
    renderWithProviders(
      <StationOverview selectedStation={station} userRole="Owner" onStationSelected={() => {}} />,
    );
    const form = await screen.findByRole('form', { name: 'Station details' });
    const grace = within(form).getByLabelText(/Shift grace period/) as HTMLInputElement;
    fireEvent.change(grace, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.init?.method === 'PUT')!;
    expect(JSON.parse(String(put.init!.body)).settings.shift_grace_minutes).toBe(0);
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull(),
    );
    expect(grace.value).toBe('0');
  });

  it('refuses an invalid GSTIN on Branding without sending (#604 review)', async () => {
    renderWithProviders(
      <StationOverview selectedStation={station} userRole="Owner" onStationSelected={() => {}} />,
    );
    fireEvent.click(await screen.findByRole('tab', { name: 'Branding' }));
    const form = await screen.findByRole('form', { name: 'Business, tax and branding' });
    fireEvent.change(within(form).getByLabelText('GSTIN'), { target: { value: '29ABC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('A GSTIN is 15 letters and digits')).toBeTruthy();
    expect(calls.some((c) => c.init?.method === 'PUT')).toBe(false);
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
    expect(screen.getByText(/^Station time \(Asia\/Dubai\)\./)).toBeTruthy();
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

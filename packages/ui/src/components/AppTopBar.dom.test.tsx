// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Station } from '@pump/shared';
import { renderWithProviders } from '../test/renderWithProviders.js';
import { ROUTES } from '../nav-intent/routes.js';

/**
 * Global search's supplier results (#575): supplier figures are per Station, so
 * search reads the selected Station's list. The "due" beside a supplier is what
 * this Station owes, and every result is one the Suppliers page lists, so the
 * deep link always finds it.
 */

const idle = { data: undefined, isLoading: false, isError: false };
const stationSuppliers = vi.fn((_stationId?: string | null) => ({
  ...idle,
  // At this Station BPCL is owed 60,000 (the organization owes it 1,60,000).
  data: [{ id: 'bpcl', name: 'BPCL Kochi', currentBalance: '60000', metadata: {} }],
}));
const orgSuppliers = vi.fn(() => ({
  ...idle,
  data: [{ id: 'bpcl', name: 'BPCL Kochi', currentBalance: '160000', metadata: {} }],
}));

vi.mock('../query/hooks.js', () => ({
  useCustomers: () => ({ ...idle, data: [] }),
  useProducts: () => ({ ...idle, data: [] }),
  useSuppliers: () => orgSuppliers(),
  useStationSuppliers: (stationId?: string | null) => stationSuppliers(stationId),
}));
vi.mock('../query/useStationAlerts.js', () => ({ useStationAlerts: () => [] }));

const { AppTopBar } = await import('./AppTopBar.js');

const STATION = { id: 'st-highway', name: 'Highway Fuels', settings: {} } as unknown as Station;

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  // cmdk measures its list; jsdom has no ResizeObserver.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  stationSuppliers.mockClear();
});

describe('AppTopBar global search: suppliers (#575)', () => {
  it("lists the selected Station's suppliers with what this Station owes, and opens its statement", async () => {
    const onNavigate = vi.fn();
    renderWithProviders(
      <AppTopBar
        selectedStation={STATION}
        navItems={[]}
        userRole="Owner"
        userName="Owner"
        syncStatus="online"
        onNavigate={onNavigate}
        onLogout={() => {}}
      />,
    );
    act(() => {
      fireEvent.keyDown(document, { key: 'k', metaKey: true });
    });
    expect(stationSuppliers).toHaveBeenCalledWith('st-highway');
    expect(orgSuppliers).not.toHaveBeenCalled();
    expect(screen.getByText('₹60,000.00 due')).toBeTruthy();
    expect(screen.queryByText('₹1,60,000.00 due')).toBeNull();
    fireEvent.click(screen.getByText('BPCL Kochi'));
    // The palette closes first and navigates on the next frame.
    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith(ROUTES.suppliers, {
        focusSupplierId: 'bpcl',
        open: 'supplier-statement',
      }),
    );
  });
});

// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Station } from '@pump/shared';
import {
  createTestQueryClient,
  muteExpectedConsoleErrors,
  renderWithProviders,
} from '../../test/renderWithProviders.js';

const recordPricing = vi.fn();
const getPricing = vi.fn(() => new Promise(() => {}));
const getPricingHistory = vi.fn(() => new Promise(() => {}));
vi.mock('../../services/cloud.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const Base = actual.CloudPricingService as new () => object;
  return {
    ...actual,
    CloudPricingService: class extends Base {
      recordPricing = (...a: unknown[]) => recordPricing(...a);
      getPricing = () => getPricing();
      getPricingHistory = () => getPricingHistory();
    },
  };
});

const { queryKeys } = await import('../../query/hooks.js');
const { FuelPricingPanel } = await import('./FuelPricingPanel.js');

/** Pricing › Fuels as cards (#605): price, effective from, last change, Change price. */

afterEach(() => {
  cleanup();
  recordPricing.mockReset();
});

const station = {
  id: 'st-1',
  name: 'Kottakkal',
  settings: { timezone: 'Asia/Kolkata' },
} as unknown as Station;

function setup() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.products(), [
    { id: 'ms', name: 'Petrol', productType: 'FUEL', unit: 'L' },
    { id: 'cng', name: 'CNG', productType: 'FUEL', unit: 'kg' },
  ]);
  queryClient.setQueryData(queryKeys.pricing('st-1'), [
    {
      productId: 'ms',
      productName: 'Petrol',
      productCode: 'MS',
      price: '102.5',
      effectiveFrom: '2026-10-12T00:30:00Z',
    },
    { productId: 'cng', productName: 'CNG', price: 0, effectiveFrom: null },
  ]);
  queryClient.setQueryData(queryKeys.pricingHistory('st-1'), [
    {
      id: 'h2',
      productId: 'ms',
      productName: 'Petrol',
      price: '102.5',
      effectiveFrom: '2026-10-12T00:30:00Z',
    },
    {
      id: 'h1',
      productId: 'ms',
      productName: 'Petrol',
      price: '101.8',
      effectiveFrom: '2026-09-20T00:30:00Z',
    },
  ]);
  renderWithProviders(<FuelPricingPanel selectedStation={station} />, { queryClient });
  return queryClient;
}

const card = (name: string) => screen.getByRole('region', { name });

describe('Fuel price cards (#605)', () => {
  it('shows each fuel’s price per unit, when it took effect and the last change', () => {
    setup();
    const petrol = card('Petrol');
    expect(petrol.textContent).toMatch('₹102.50/L');
    expect(petrol.textContent).toMatch('Effective from 12 Oct 2026');
    expect(petrol.textContent).toMatch('₹101.80 → ₹102.50 (+₹0.70)');
    const cng = card('CNG');
    expect(cng.textContent).toMatch('Not set');
    expect(cng.textContent).toMatch('None yet');
  });

  it('keeps the difference in plain ink: a price change is not a problem', () => {
    setup();
    const diff = within(card('Petrol')).getByText('(+₹0.70)');
    expect(diff.className).not.toMatch(/danger|warning|success/);
  });

  it('Change price opens the drawer on that fuel', () => {
    setup();
    fireEvent.click(within(card('CNG')).getByRole('button', { name: 'Change price of CNG' }));
    expect(document.querySelector('.drawer-container')).toBeTruthy();
  });

  it('keeps the price history as a table below', () => {
    setup();
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(screen.getByText('Price history')).toBeTruthy();
  });
});

describe('changing a price (#606)', () => {
  const change = (rate: string) => {
    fireEvent.click(within(card('Petrol')).getByRole('button', { name: 'Change price of Petrol' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. 96.43'), { target: { value: rate } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply new rate' }));
  };

  it('reads Saving… on the card, then the server’s price, while the refresh never answers', async () => {
    let answer!: (v: unknown) => void;
    recordPricing.mockReturnValue(new Promise((r) => (answer = r)));
    setup();

    change('103.10');

    await waitFor(() => expect(within(card('Petrol')).getByText('Saving…')).toBeTruthy());
    expect(card('Petrol').textContent).not.toMatch('₹102.50/L');
    expect(recordPricing.mock.calls[0][1]).toEqual({ idempotencyKey: expect.any(String) });

    answer({
      id: 'h3',
      stationId: 'st-1',
      productId: 'ms',
      price: '103.1',
      effectiveFrom: '2026-10-15T00:30:00.000Z',
      createdAt: '2026-10-15T00:25:00.000Z',
    });

    await waitFor(() => expect(card('Petrol').textContent).toMatch('₹103.10/L'));
    expect(within(card('Petrol')).queryByText('Saving…')).toBeNull();
    // The last change recomputes from the history the answer joined.
    expect(card('Petrol').textContent).toMatch('₹102.50 → ₹103.10 (+₹0.60)');
    expect(card('Petrol').getAttribute('data-flash')).toBe('true');
    expect(getPricing).toHaveBeenCalled();
  });

  it('shows a refused change’s reason on the card, and the old price', async () => {
    const restore = muteExpectedConsoleErrors([/Rate must be positive/]);
    try {
      recordPricing.mockRejectedValue(
        Object.assign(new Error('Rate must be positive'), { status: 400 }),
      );
      setup();

      change('103.10');

      const alert = await within(card('Petrol')).findByRole('alert');
      expect(alert.textContent).toBe(
        'Not saved: Rate must be positive. Use Change price to try again.',
      );
      expect(card('Petrol').textContent).toMatch('₹102.50/L');
    } finally {
      restore();
    }
  });
});

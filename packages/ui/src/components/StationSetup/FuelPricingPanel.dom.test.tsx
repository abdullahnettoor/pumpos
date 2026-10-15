// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { Station } from '@pump/shared';
import { createTestQueryClient, renderWithProviders } from '../../test/renderWithProviders.js';
import { queryKeys } from '../../query/hooks.js';
import { FuelPricingPanel } from './FuelPricingPanel.js';

/** Pricing › Fuels as cards (#605): price, effective from, last change, Change price. */

afterEach(cleanup);

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

// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
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

const { FUEL_PRICE_TIMEOUT_MS, queryKeys } = await import('../../query/hooks.js');
const { FuelPricingPanel } = await import('./FuelPricingPanel.js');

/** Pricing › Fuels as cards (#605): price, effective from, last change, Change price. */

afterEach(() => {
  cleanup();
  recordPricing.mockReset();
  vi.useRealTimers();
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
    expect(recordPricing.mock.calls[0][1]).toMatchObject({ idempotencyKey: expect.any(String) });
    expect(recordPricing.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);

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

  /** Opens the drawer on Petrol, rate and effective time as given, and applies. */
  const rateInput = () => screen.getByPlaceholderText('e.g. 96.43') as HTMLInputElement;
  const whenInput = () =>
    document.querySelector('input[type="datetime-local"]') as HTMLInputElement;

  it('after an unknown outcome, Try again reopens on the same body and reuses the key', async () => {
    const restore = muteExpectedConsoleErrors([/Network error/]);
    try {
      recordPricing.mockRejectedValueOnce(
        Object.assign(new Error('Network error'), { code: 'NETWORK' }),
      );
      setup();
      fireEvent.click(
        within(card('Petrol')).getByRole('button', { name: 'Change price of Petrol' }),
      );
      fireEvent.change(rateInput(), { target: { value: '103.10' } });
      fireEvent.change(whenInput(), { target: { value: '2026-10-15T06:00' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply new rate' }));

      const alert = await within(card('Petrol')).findByRole('alert');
      expect(alert.textContent).toContain("Couldn't confirm the new rate.");
      const [firstBody, firstOpts] = recordPricing.mock.calls[0];

      recordPricing.mockReturnValue(new Promise(() => {}));
      fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
      // The attempt, exactly: not a blank rate or a new "now".
      expect(rateInput().value).toBe('103.1');
      expect(whenInput().value).toBe('2026-10-15T06:00');
      fireEvent.click(screen.getByRole('button', { name: 'Apply new rate' }));

      await waitFor(() => expect(recordPricing).toHaveBeenCalledTimes(2));
      const [secondBody, secondOpts] = recordPricing.mock.calls[1];
      expect(secondBody).toEqual(firstBody);
      expect(secondOpts.idempotencyKey).toBe(firstOpts.idempotencyKey);
    } finally {
      restore();
    }
  });

  it('after a decided refusal, Change price starts fresh', async () => {
    const restore = muteExpectedConsoleErrors([/Rate must be positive/]);
    try {
      recordPricing.mockRejectedValueOnce(
        Object.assign(new Error('Rate must be positive'), { status: 400 }),
      );
      setup();
      change('103.10');
      await within(card('Petrol')).findByRole('alert');

      fireEvent.click(
        within(card('Petrol')).getByRole('button', { name: 'Change price of Petrol' }),
      );
      expect(rateInput().value).toBe('');
    } finally {
      restore();
    }
  });

  it('a hung change times out as unconfirmed, and Try again reuses the key', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    recordPricing.mockImplementation(
      (_body: unknown, opts: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('Network error'), { code: 'NETWORK' })),
          );
        }),
    );
    const restore = muteExpectedConsoleErrors([/Network error/]);
    try {
      setup();
      change('103.10');
      await waitFor(() => expect(within(card('Petrol')).getByText('Saving…')).toBeTruthy());

      await vi.advanceTimersByTimeAsync(FUEL_PRICE_TIMEOUT_MS + 1);

      const alert = await within(card('Petrol')).findByRole('alert');
      expect(alert.textContent).toContain("Couldn't confirm the new rate.");
      expect(within(card('Petrol')).queryByText('Saving…')).toBeNull();
      expect(
        (
          within(card('Petrol')).getByRole('button', {
            name: 'Change price of Petrol',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);

      fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
      fireEvent.click(screen.getByRole('button', { name: 'Apply new rate' }));
      await waitFor(() => expect(recordPricing).toHaveBeenCalledTimes(2));
      expect(recordPricing.mock.calls[1][0]).toEqual(recordPricing.mock.calls[0][0]);
      expect(recordPricing.mock.calls[1][1].idempotencyKey).toBe(
        recordPricing.mock.calls[0][1].idempotencyKey,
      );
    } finally {
      restore();
    }
  });
});

describe('scheduled prices (#619)', () => {
  // The clock: 16 Oct 2026, 01:30 am at the station; Petrol changes at 6:00 am.
  const NOW = new Date('2026-10-15T20:00:00Z');
  const scheduled = {
    id: 'h3',
    productId: 'ms',
    productName: 'Petrol',
    price: '103',
    effectiveFrom: '2026-10-16T00:30:00Z',
    createdAt: '2026-10-15T19:00:00Z',
  };
  const setupScheduled = () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    const queryClient = setup();
    queryClient.setQueryData(queryKeys.pricingHistory('st-1'), (h: unknown[] = []) => [
      scheduled,
      ...h,
    ]);
    return queryClient;
  };

  it('the card shows the price now and the change still ahead', async () => {
    setupScheduled();
    await waitFor(() => expect(within(card('Petrol')).getByText('now')).toBeTruthy());
    const petrol = card('Petrol');
    expect(petrol.textContent).toMatch('₹102.50/L');
    const next = within(petrol).getByTestId('fuel-price-scheduled');
    expect(next.textContent).toMatch('Scheduled');
    expect(next.textContent).toMatch('₹103.00/L');
    expect(next.textContent).toMatch('from Fri 16 Oct, 6:00\u00a0am');
    // The last change is the one into the current price, not the scheduled one.
    expect(petrol.textContent).toMatch('₹101.80 → ₹102.50 (+₹0.70)');
    // A fuel with nothing scheduled reads as before.
    expect(within(card('CNG')).queryByText('now')).toBeNull();
  });

  it('marks the scheduled row in the price history', async () => {
    setupScheduled();
    const table = screen.getByRole('table');
    await waitFor(() => expect(within(table).getAllByText('Scheduled')).toHaveLength(1));
    expect(within(table).getByText('Status')).toBeTruthy();
  });

  it('refreshes the current prices when the scheduled time comes', async () => {
    setupScheduled();
    getPricing.mockClear();
    await waitFor(() => expect(within(card('Petrol')).getByText('now')).toBeTruthy());
    await vi.advanceTimersByTimeAsync(4.5 * 60 * 60 * 1000 + 2_000);
    await waitFor(() => expect(getPricing).toHaveBeenCalled());
    // Past its time, the change is no longer "scheduled".
    await waitFor(() =>
      expect(within(card('Petrol')).queryByTestId('fuel-price-scheduled')).toBeNull(),
    );
  });

  it('a remount after the scheduled time refreshes prices fetched before it (#628 review)', async () => {
    // Fetched at 05:59 (station), unmounted; 103 takes effect at 06:00; back at 06:01.
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-10-16T00:29:00Z') });
    const queryClient = setup();
    queryClient.setQueryData(queryKeys.pricingHistory('st-1'), (h: unknown[] = []) => [
      scheduled,
      ...h,
    ]);
    await waitFor(() => expect(within(card('Petrol')).getByText('now')).toBeTruthy());
    cleanup();

    vi.setSystemTime(new Date('2026-10-16T00:31:00Z'));
    getPricing.mockClear();
    getPricing.mockResolvedValueOnce([
      {
        productId: 'ms',
        productName: 'Petrol',
        productCode: 'MS',
        price: '103',
        effectiveFrom: '2026-10-16T00:30:00Z',
      },
      { productId: 'cng', productName: 'CNG', price: 0, effectiveFrom: null },
    ] as never);
    renderWithProviders(<FuelPricingPanel selectedStation={station} />, { queryClient });

    await waitFor(() => expect(card('Petrol').textContent).toMatch('₹103.00/L'));
    expect(getPricing).toHaveBeenCalledTimes(1);
    expect(within(card('Petrol')).queryByTestId('fuel-price-scheduled')).toBeNull();
    expect(card('Petrol').textContent).toMatch('₹102.50 → ₹103.00 (+₹0.50)');
  });

  it('a change applied for later reads "Fuel rate scheduled." and stays off the current price', async () => {
    setupScheduled();
    recordPricing.mockResolvedValue({
      id: 'h4',
      stationId: 'st-1',
      productId: 'ms',
      price: '104',
      effectiveFrom: '2026-10-17T00:30:00.000Z',
      createdAt: NOW.toISOString(),
    });
    fireEvent.click(within(card('Petrol')).getByRole('button', { name: 'Change price of Petrol' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. 96.43'), { target: { value: '104' } });
    fireEvent.change(document.querySelector('input[type="datetime-local"]') as HTMLInputElement, {
      target: { value: '2026-10-17T06:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply new rate' }));
    expect(await screen.findByText('Fuel rate scheduled.')).toBeTruthy();
    expect(card('Petrol').textContent).toMatch('₹102.50/L');
  });
});

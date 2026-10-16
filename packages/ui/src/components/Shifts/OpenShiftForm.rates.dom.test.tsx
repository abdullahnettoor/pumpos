// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
const { OpenShiftForm } = await import('./OpenShiftForm.js');

/**
 * "Rates for this shift" on the Open shift form (#619): the rate each fuel
 * keeps for the whole shift, a warning when a scheduled change falls inside
 * the planned window, and Change price without leaving the form.
 */

const STATION = 'st-1';
const TODAY = '2026-10-16';
// 6:30 am at the station; Petrol changes at 10:00 am.
const NOW = new Date('2026-10-16T01:00:00Z');
const ist = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();

const templates = [
  { id: 'morning', name: 'Morning', startTime: '06:00', endTime: '14:00' },
  { id: 'night', name: 'Night', startTime: '22:00', endTime: '06:00' },
];

const props = (over: Record<string, unknown> = {}) => ({
  lastShift: { id: 'prev' },
  stationId: STATION,
  templates,
  dispensers: [],
  staff: [],
  nozzles: [],
  terminals: [],
  terminalAssignments: [],
  onTerminalAssignmentChange: vi.fn(),
  selectedTemplateId: 'morning',
  businessDate: TODAY,
  currentBusinessDate: TODAY,
  staffAssignments: [],
  onStaffAssignmentChange: vi.fn(),
  onOpeningFloatChange: vi.fn(),
  initialReadings: [],
  onInitialReadingChange: vi.fn(),
  isOpening: false,
  onSubmit: vi.fn(),
  clock: { timeZone: 'Asia/Kolkata', dayStartsAt: '06:00' },
  canChangePrice: true,
  ...over,
});

function setup(over: Record<string, unknown> = {}, scheduledAt = ist(TODAY, '10:00')) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.businessDayStatus(STATION, TODAY), {
    requestedState: 'OPEN',
    openBusinessDays: [{ id: 'bd', businessDate: TODAY }],
  });
  queryClient.setQueryData(queryKeys.products(), [
    { id: 'ms', name: 'Petrol', productType: 'FUEL', unit: 'L' },
    { id: 'hsd', name: 'Diesel', productType: 'FUEL', unit: 'L' },
  ]);
  queryClient.setQueryData(queryKeys.pricing(STATION), [
    {
      productId: 'ms',
      productName: 'Petrol',
      productCode: 'MS',
      price: 102.5,
      effectiveFrom: ist('2026-10-12', '06:00'),
    },
    {
      productId: 'hsd',
      productName: 'Diesel',
      productCode: 'HSD',
      price: 90.1,
      effectiveFrom: ist('2026-10-01', '06:00'),
    },
  ]);
  queryClient.setQueryData(queryKeys.pricingHistory(STATION), [
    {
      id: 'h3',
      productId: 'ms',
      productName: 'Petrol',
      price: '103',
      effectiveFrom: scheduledAt,
      createdAt: ist('2026-10-15', '20:00'),
    },
    {
      id: 'h2',
      productId: 'ms',
      productName: 'Petrol',
      price: '102.5',
      effectiveFrom: ist('2026-10-12', '06:00'),
      createdAt: ist('2026-10-11', '20:00'),
    },
    {
      id: 'h1',
      productId: 'hsd',
      productName: 'Diesel',
      price: '90.1',
      effectiveFrom: ist('2026-10-01', '06:00'),
      createdAt: ist('2026-09-30', '20:00'),
    },
  ]);
  const p = props(over);
  renderWithProviders(<OpenShiftForm {...p} />, { queryClient });
  return { queryClient, props: p };
}

const rates = () => screen.getByRole('list', { name: 'Rates for this shift' });
const rate = (name: string) =>
  within(rates())
    .getAllByTestId('shift-rate')
    .find((li) => li.textContent?.startsWith(name))!;

describe('Rates for this shift (#619)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  });
  afterEach(() => {
    cleanup();
    recordPricing.mockReset();
    vi.useRealTimers();
  });

  it('lists each fuel’s current rate and since when', () => {
    setup();
    expect(rate('Petrol').textContent).toMatch('₹102.50/L');
    expect(rate('Petrol').textContent).toMatch('since Mon 12 Oct, 6:00\u00a0am');
    expect(rate('Diesel').textContent).toMatch('₹90.10/L');
  });

  it('warns when a scheduled change takes effect during the planned window', async () => {
    setup();
    const warning = await screen.findByTestId('shift-rate-warning');
    expect(warning.textContent).toBe(
      'Petrol changes to ₹103.00 at 10:00\u00a0am, during this shift. This shift keeps ₹102.50. ' +
        'Close and reopen the shift at 10:00\u00a0am to use the new rate.',
    );
    // Open shift stays the one primary, with no extra confirmation.
    expect(screen.getAllByRole('button', { name: /Start Shift Operations/ })).toHaveLength(1);
  });

  it('does not warn for a change after the planned end; the rate names it quietly', () => {
    setup({}, ist(TODAY, '15:00'));
    expect(screen.queryByTestId('shift-rate-warning')).toBeNull();
    const next = within(rate('Petrol')).getByTestId('shift-rate-next');
    expect(next.textContent).toBe(' · Next: ₹103.00/L from Fri 16 Oct, 3:00\u00a0pm');
    expect(next.className).not.toMatch(/warning|danger/);
  });

  it('a change during the shift is the warning only, not repeated on its rate', async () => {
    setup();
    await screen.findByTestId('shift-rate-warning');
    expect(within(rate('Petrol')).queryByTestId('shift-rate-next')).toBeNull();
  });

  it('warns on an early open for a change before the planned start (#628 review)', async () => {
    // 5:30 am, opening the 6:00 am Morning shift early; Petrol changes at 5:45 am.
    vi.setSystemTime(new Date(ist(TODAY, '05:30')));
    setup({}, ist(TODAY, '05:45'));
    expect((await screen.findByTestId('shift-rate-warning')).textContent).toMatch(
      'Petrol changes to ₹103.00 at 5:45\u00a0am, during this shift.',
    );
  });

  it('says the server fixes the rates, and offers Retry when they fail to load', async () => {
    const restore = muteExpectedConsoleErrors([/pricing down/]);
    try {
      const queryClient = createTestQueryClient();
      queryClient.setQueryData(queryKeys.businessDayStatus(STATION, TODAY), {
        requestedState: 'OPEN',
        openBusinessDays: [{ id: 'bd', businessDate: TODAY }],
      });
      queryClient.setQueryData(queryKeys.products(), []);
      queryClient.setQueryData(queryKeys.pricingHistory(STATION), []);
      getPricing.mockRejectedValueOnce(new Error('pricing down') as never);
      renderWithProviders(<OpenShiftForm {...props()} />, { queryClient });
      expect(
        screen.getByText("Rates are fixed by the server's time when you open the shift."),
      ).toBeTruthy();
      expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
    } finally {
      restore();
    }
  });

  it('follows the template: the night window runs past a change at 5:00 am', async () => {
    setup({ selectedTemplateId: 'night' }, ist('2026-10-17', '05:00'));
    expect(await screen.findByTestId('shift-rate-warning')).toBeTruthy();
  });

  it('is read-only for a user who may not change prices', () => {
    setup({ canChangePrice: false });
    expect(within(rates()).queryByRole('button')).toBeNull();
  });

  it('Change price opens the drawer; applying updates the rate in place, never opens the shift', async () => {
    let answer!: (v: unknown) => void;
    recordPricing.mockReturnValue(new Promise((r) => (answer = r)));
    const { props: p } = setup();

    fireEvent.click(within(rate('Diesel')).getByRole('button', { name: 'Change price of Diesel' }));
    expect(document.querySelector('.drawer-container')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('e.g. 96.43'), { target: { value: '91.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply new rate' }));

    await waitFor(() => expect(within(rate('Diesel')).getByText('Saving…')).toBeTruthy());
    expect(recordPricing.mock.calls[0][1]).toMatchObject({ idempotencyKey: expect.any(String) });
    answer({
      id: 'h9',
      stationId: STATION,
      productId: 'hsd',
      price: '91.2',
      effectiveFrom: ist(TODAY, '06:30'),
      createdAt: NOW.toISOString(),
    });
    await waitFor(() => expect(rate('Diesel').textContent).toMatch('₹91.20/L'));
    expect(rate('Diesel').textContent).toMatch('since Fri 16 Oct, 6:30\u00a0am');
    expect(p.onSubmit).not.toHaveBeenCalled();
  });

  it('shows a refused change on its rate, with the next step', async () => {
    const restore = muteExpectedConsoleErrors([/Rate must be positive/]);
    try {
      recordPricing.mockRejectedValue(
        Object.assign(new Error('Rate must be positive'), { status: 400 }),
      );
      setup();
      fireEvent.click(
        within(rate('Diesel')).getByRole('button', { name: 'Change price of Diesel' }),
      );
      fireEvent.change(screen.getByPlaceholderText('e.g. 96.43'), { target: { value: '91.2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply new rate' }));
      const alert = await within(rate('Diesel')).findByRole('alert');
      expect(alert.textContent).toBe(
        'Not saved: Rate must be positive. Use Change price to try again.',
      );
      expect(rate('Diesel').textContent).toMatch('₹90.10/L');
    } finally {
      restore();
    }
  });
});

describe('a fuel with no rate in effect (#630)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  });
  afterEach(() => {
    cleanup();
    recordPricing.mockReset();
    vi.useRealTimers();
  });

  // Shift status lists the nozzles of pumps in service: Petrol and Diesel.
  const nozzles = [
    { id: 'n1', name: 'N1', productId: 'ms', productName: 'Petrol', productCode: 'MS' },
    { id: 'n2', name: 'N2', productId: 'hsd', productName: 'Diesel', productCode: 'HSD' },
  ];

  /** Diesel has no price in effect: never priced, or (`scheduledAt`) only for later. */
  function setupNoRate(over: Record<string, unknown> = {}, scheduledAt?: string) {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.businessDayStatus(STATION, TODAY), {
      requestedState: 'OPEN',
      openBusinessDays: [{ id: 'bd', businessDate: TODAY }],
    });
    queryClient.setQueryData(queryKeys.products(), [
      { id: 'ms', name: 'Petrol', productType: 'FUEL', unit: 'L' },
      { id: 'hsd', name: 'Diesel', productType: 'FUEL', unit: 'L' },
      { id: 'cng', name: 'CNG', productType: 'FUEL', unit: 'kg' },
    ]);
    queryClient.setQueryData(queryKeys.pricing(STATION), [
      {
        productId: 'ms',
        productName: 'Petrol',
        productCode: 'MS',
        price: 102.5,
        effectiveFrom: ist('2026-10-12', '06:00'),
      },
      // The API's convention for a fuel with no price in effect.
      {
        productId: 'hsd',
        productName: 'Diesel',
        productCode: 'HSD',
        price: 0,
        effectiveFrom: null,
      },
      // No pump in service sells CNG: unpriced, but it does not block.
      { productId: 'cng', productName: 'CNG', productCode: 'CNG', price: 0, effectiveFrom: null },
    ]);
    queryClient.setQueryData(
      queryKeys.pricingHistory(STATION),
      scheduledAt
        ? [
            {
              id: 'h9',
              productId: 'hsd',
              productName: 'Diesel',
              price: '90.5',
              effectiveFrom: scheduledAt,
              createdAt: ist('2026-10-15', '20:00'),
            },
          ]
        : [],
    );
    const p = props({ nozzles, ...over });
    renderWithProviders(<OpenShiftForm {...p} />, { queryClient });
    return { queryClient, props: p };
  }

  const start = () =>
    screen.getByRole('button', { name: /Start Shift Operations/ }) as HTMLButtonElement;

  it('marks the fuel, offers Change price, and disables Open shift with the reason', () => {
    setupNoRate();
    expect(within(rate('Diesel')).getByText('No rate in effect')).toBeTruthy();
    expect(within(rate('Diesel')).getByTestId('shift-rate-missing').textContent).toBe(
      'Set a rate before opening',
    );
    expect(
      within(rate('Diesel')).getByRole('button', { name: 'Change price of Diesel' }),
    ).toBeTruthy();
    expect(start().disabled).toBe(true);
    expect(screen.getByTestId('open-shift-rate-block').textContent).toBe(
      'Diesel has no rate in effect. Set a rate before opening.',
    );
    // A fuel no running pump sells stays as it was.
    expect(within(rate('CNG')).queryByText('No rate in effect')).toBeNull();
    expect(rate('CNG').textContent).toMatch('Not set');
    expect(within(rate('Petrol')).queryByText('No rate in effect')).toBeNull();
  });

  it('tells a user who may not change prices whom to ask', () => {
    setupNoRate({ canChangePrice: false });
    expect(within(rate('Diesel')).getByText('No rate in effect')).toBeTruthy();
    expect(within(rate('Diesel')).getByTestId('shift-rate-missing').textContent).toBe(
      'Ask your Owner or Manager to set a rate',
    );
    expect(within(rates()).queryByRole('button')).toBeNull();
    expect(start().disabled).toBe(true);
  });

  it('counts a fuel priced only for later', () => {
    setupNoRate({}, ist(TODAY, '15:00'));
    expect(within(rate('Diesel')).getByText('No rate in effect')).toBeTruthy();
    expect(within(rate('Diesel')).getByTestId('shift-rate-next').textContent).toBe(
      ' · Next: ₹90.50/L from Fri 16 Oct, 3:00\u00a0pm',
    );
    expect(start().disabled).toBe(true);
  });

  it('enables Open shift once the rate is set', async () => {
    let answer!: (v: unknown) => void;
    recordPricing.mockReturnValue(new Promise((r) => (answer = r)));
    setupNoRate();
    fireEvent.click(within(rate('Diesel')).getByRole('button', { name: 'Change price of Diesel' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. 96.43'), { target: { value: '90.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply new rate' }));
    answer({
      id: 'h9',
      stationId: STATION,
      productId: 'hsd',
      price: '90.5',
      effectiveFrom: ist(TODAY, '06:30'),
      createdAt: NOW.toISOString(),
    });
    await waitFor(() => expect(rate('Diesel').textContent).toMatch('₹90.50/L'));
    expect(within(rate('Diesel')).queryByText('No rate in effect')).toBeNull();
    expect(screen.queryByTestId('open-shift-rate-block')).toBeNull();
    expect(start().disabled).toBe(false);
  });

  it("shows the server's refusal beside Open shift, until the rates are read again", () => {
    // Every rate this screen read is in effect; the server, at the open, said otherwise.
    const refusal = 'Diesel has no rate in effect. Set a rate before opening.';
    setup({ nozzles, openRefusal: { message: refusal, at: NOW.getTime() + 60_000 } });
    const alert = screen.getByTestId('open-shift-rate-block');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toBe(refusal);
  });

  it('drops the refusal once fresher rates are read', () => {
    setup({
      nozzles,
      openRefusal: { message: 'Diesel has no rate in effect.', at: NOW.getTime() - 60_000 },
    });
    expect(screen.queryByTestId('open-shift-rate-block')).toBeNull();
    expect(start().disabled).toBe(false);
  });

  it('an archived fuel still on a pump in service, priced, does not block (#633 review)', () => {
    // Pricing lists it (the API includes fuels on in-service nozzles even when
    // archived); the catalogue no longer does.
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.businessDayStatus(STATION, TODAY), {
      requestedState: 'OPEN',
      openBusinessDays: [{ id: 'bd', businessDate: TODAY }],
    });
    queryClient.setQueryData(queryKeys.products(), [
      { id: 'ms', name: 'Petrol', productType: 'FUEL', unit: 'L' },
    ]);
    queryClient.setQueryData(queryKeys.pricing(STATION), [
      {
        productId: 'ms',
        productName: 'Petrol',
        productCode: 'MS',
        price: 102.5,
        effectiveFrom: ist('2026-10-12', '06:00'),
      },
      {
        productId: 'hsd',
        productName: 'Diesel',
        productCode: 'HSD',
        price: 90.1,
        effectiveFrom: ist('2026-10-01', '06:00'),
      },
    ]);
    queryClient.setQueryData(queryKeys.pricingHistory(STATION), []);
    renderWithProviders(<OpenShiftForm {...props({ nozzles })} />, { queryClient });
    expect(rate('Diesel').textContent).toMatch('₹90.10/L');
    expect(screen.queryByTestId('open-shift-rate-block')).toBeNull();
    expect(start().disabled).toBe(false);
  });

  it('blocks nothing while the rates have not loaded', () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.businessDayStatus(STATION, TODAY), {
      requestedState: 'OPEN',
      openBusinessDays: [{ id: 'bd', businessDate: TODAY }],
    });
    renderWithProviders(<OpenShiftForm {...props({ nozzles })} />, { queryClient });
    expect(screen.queryByTestId('open-shift-rate-block')).toBeNull();
    expect(start().disabled).toBe(false);
  });
});

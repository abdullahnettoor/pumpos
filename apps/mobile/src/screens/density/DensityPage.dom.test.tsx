// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DensityTodaySummary, Station } from '@pump/shared';

const mock = vi.hoisted(() => ({
  station: null as unknown,
  today: null as unknown,
  readings: [] as unknown[],
  products: [] as unknown[],
  tanks: [] as unknown[],
  nozzles: [] as unknown[],
  saved: null as unknown,
  payload: null as unknown,
}));

vi.mock('@pump/ui', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDensityTodaySummary: () => ({ data: mock.today, isLoading: false, isError: false }),
  useDensityReadings: (_station: string, params: { productId?: string }) => ({
    data: params.productId
      ? mock.readings.filter((row) => (row as { productId: string }).productId === params.productId)
      : mock.readings,
    isLoading: false,
    isError: false,
  }),
  useRecordDensityReading: () => ({
    isPending: false,
    mutateAsync: async (value: { payload: unknown }) => {
      mock.payload = value.payload;
      return mock.saved;
    },
  }),
  useProducts: () => ({ data: mock.products }),
  useTanks: () => ({ data: mock.tanks }),
  useNozzles: () => ({ data: mock.nozzles }),
  createIdempotencyKey: () => 'density-idempotency',
}));

const { DensityPage } = await import('./DensityPage.js');
const { ShellContext } = await import('../../shell/context.js');
const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  settings: {
    timezone: 'Asia/Kolkata',
    business_day_starts_at: '06:00',
    densityMethod: 'API_MPMS_11_1_ADJUNCT',
    densityEntryMethod: 'HYDROMETER',
    densitySpecBands: { 'p-ms': { minKgM3: 720, maxKgM3: 775 } },
  },
} as unknown as Station;

const todaySummary = {
  businessDate: '2026-10-11',
  recordedCount: 1,
  missingCount: 1,
  totalProducts: 2,
  missingProducts: [{ productId: 'p-hsd', productName: 'Diesel', productCode: 'HSD' }],
  products: [
    {
      productId: 'p-ms',
      productName: 'Petrol',
      productCode: 'MS',
      todayRecorded: true,
      latestToday: {
        id: 'r-ms',
        productId: 'p-ms',
        productName: 'Petrol',
        productCode: 'MS',
        density15: 750.25,
        kind: 'MORNING',
        recordedAt: '2026-10-11T06:00:00Z',
        flags: [],
        businessDate: '2026-10-11',
        sampledFrom: 'TANK',
        tankName: 'Tank 1',
        delta: 1,
      },
      trendValues: [749, 750],
      lastReadings: [],
    },
    {
      productId: 'p-hsd',
      productName: 'Diesel',
      productCode: 'HSD',
      todayRecorded: false,
      latestToday: null,
      trendValues: [],
      lastReadings: [],
    },
  ],
} as unknown as DensityTodaySummary;

const reading = {
  id: 'r-ms',
  productId: 'p-ms',
  productName: 'Petrol',
  productCode: 'MS',
  density15: 750.25,
  kind: 'MORNING',
  recordedAt: '2026-10-11T06:00:00Z',
  flags: ['UNEXPLAINED_JUMP'],
  businessDate: '2026-10-11',
  sampledFrom: 'TANK',
  tankName: 'Tank 1',
  observedDensity: 742,
  observedTempC: 30,
  delta: 4,
};

const renderPage = () =>
  render(
    <ShellContext.Provider
      value={{
        station,
        stationName: 'Highway Fuels',
        userName: 'A B',
        role: 'Manager',
        openAccount: () => {},
      }}
    >
      <DensityPage />
    </ShellContext.Provider>,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-11T08:00:00Z'));
  mock.station = station;
  mock.today = todaySummary;
  mock.readings = [
    reading,
    {
      ...reading,
      id: 'r-hsd',
      productId: 'p-hsd',
      productName: 'Diesel',
      productCode: 'HSD',
      density15: 834.2,
      flags: [],
      delta: 1.2,
    },
  ];
  mock.products = [
    { id: 'p-ms', name: 'Petrol', code: 'MS', productType: 'FUEL', isActive: true },
    { id: 'p-hsd', name: 'Diesel', code: 'HSD', productType: 'FUEL', isActive: true },
  ];
  mock.tanks = [{ id: 't1', name: 'Tank 1', productId: 'p-ms' }];
  mock.nozzles = [{ id: 'n1', name: 'Nozzle 1', productId: 'p-ms' }];
  mock.saved = { ...reading, isUnexplainedJump: true };
  mock.payload = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Density register', () => {
  it("shows today's value, spec band, missing state and recent readings by product", () => {
    renderPage();
    const petrol = screen.getByRole('article', { name: /Petrol/ });
    expect(within(petrol).getAllByText('750.25')).toHaveLength(2);
    expect(within(petrol).getByText('Spec 720–775 kg/m³')).toBeTruthy();
    expect(within(petrol).getByText(/Recorded today/)).toBeTruthy();
    expect(within(petrol).getByText(/Tank 1/)).toBeTruthy();
    expect(screen.getByRole('article', { name: /Diesel/ }).textContent).toContain('Missing today');
  });

  it('computes 15 °C density and posts a hydrometer reading without blocking on a jump', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Record density/ }));
    const sheet = screen.getByRole('dialog', { name: 'Record density' });
    fireEvent.change(within(sheet).getByLabelText('Observed hydrometer (kg/m³)'), {
      target: { value: '828' },
    });
    fireEvent.change(within(sheet).getByLabelText('Observed temperature (°C)'), {
      target: { value: '32' },
    });
    expect(within(sheet).getByText('840.10 kg/m³')).toBeTruthy();
    fireEvent.change(within(sheet).getByLabelText('Sampled from'), { target: { value: 'TANK' } });
    fireEvent.change(within(sheet).getByLabelText('Tank'), { target: { value: 't1' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save reading' }));

    await waitFor(() =>
      expect(mock.payload).toEqual(
        expect.objectContaining({
          stationId: 'st-1',
          productId: 'p-ms',
          kind: 'MORNING',
          sampledFrom: 'TANK',
          tankId: 't1',
          entryMethod: 'HYDROMETER',
          observedDensity: 828,
          observedTempC: 32,
        }),
      ),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('posts a direct 15 °C value with the station default method selected initially', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Record density/ }));
    const sheet = screen.getByRole('dialog', { name: 'Record density' });
    expect((within(sheet).getByLabelText('Entry method') as HTMLSelectElement).value).toBe(
      'HYDROMETER',
    );
    fireEvent.change(within(sheet).getByLabelText('Entry method'), {
      target: { value: 'DIRECT_15' },
    });
    fireEvent.change(within(sheet).getByLabelText('Density at 15 °C (kg/m³)'), {
      target: { value: '750.25' },
    });
    expect(
      within(sheet).getByRole('button', { name: 'Save reading' }).hasAttribute('disabled'),
    ).toBe(false);
    fireEvent.submit(sheet.querySelector('form')!);

    await waitFor(() =>
      expect(mock.payload).toEqual(
        expect.objectContaining({
          stationId: 'st-1',
          productId: 'p-ms',
          kind: 'MORNING',
          entryMethod: 'DIRECT_15',
          density15: 750.25,
        }),
      ),
    );
  });

  it('filters the Register by product and keeps flagged readings visible', () => {
    renderPage();
    fireEvent.click(screen.getByRole('radio', { name: 'Register' }));
    const filter = screen.getByLabelText('Filter by product');
    fireEvent.change(filter, { target: { value: 'p-ms' } });
    expect(screen.getByText('UNEXPLAINED_JUMP')).toBeTruthy();
    expect(screen.queryByText('Diesel')).toBeNull();
    fireEvent.change(filter, { target: { value: '' } });
    expect(screen.getByText('Diesel')).toBeTruthy();
  });
});

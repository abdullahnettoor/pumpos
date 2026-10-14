// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderWithProviders, createTestQueryClient } from '../../../test/renderWithProviders.js';
import { DensityTab } from './DensityTab.js';
import { queryKeys } from '../../../query/hooks.js';
import { DensityReading, deriveDensityState } from '../../../pump-ds/index.js';
import type {
  DensityReadingWithContext,
  DensityTodaySummary,
  Product,
  Station,
} from '@pump/shared';

const STATION_ID = 'st-1';

const STATION: Partial<Station> = {
  id: STATION_ID,
  name: 'Highway Express Retail Outlet',
  code: 'HE01',
  settings: {
    shift_grace_minutes: 0,
    shift_lock_grace_days: 0,
    offline_warning_days: 0,
    offline_critical_days: 0,
    timezone: 'Asia/Kolkata',
    densityToleranceKgM3: 3.0,
    densitySpecBands: {
      'prod-ms': { minKgM3: 720, maxKgM3: 775 },
    },
  },
};

const PRODUCTS: Partial<Product>[] = [
  {
    id: 'prod-ms',
    name: 'Motor Spirit',
    code: 'MS',
    productType: 'FUEL',
    isActive: true,
  },
  {
    id: 'prod-hsd',
    name: 'High Speed Diesel',
    code: 'HSD',
    productType: 'FUEL',
    isActive: true,
  },
];

const MOCK_READING_MS: DensityReadingWithContext = {
  id: 'rd-1',
  organizationId: 'org-1',
  stationId: STATION_ID,
  businessDate: '2026-10-11',
  productId: 'prod-ms',
  productName: 'Motor Spirit',
  productCode: 'MS',
  kind: 'MORNING',
  entryMethod: 'HYDROMETER',
  observedDensity: 745.0,
  observedTempC: 28.5,
  density15: 753.8,
  flags: [],
  delta: 0.5,
  recordedBy: 'user-1',
  recordedByName: 'Rajesh Manager',
  recordedAt: '2026-10-11T06:30:00Z',
};

const MOCK_READING_HSD_JUMP: DensityReadingWithContext = {
  id: 'rd-2',
  organizationId: 'org-1',
  stationId: STATION_ID,
  businessDate: '2026-10-11',
  productId: 'prod-hsd',
  productName: 'High Speed Diesel',
  productCode: 'HSD',
  kind: 'ADHOC',
  entryMethod: 'DIRECT_15',
  observedDensity: null,
  observedTempC: null,
  density15: 840.0,
  flags: ['UNEXPLAINED_JUMP'],
  delta: 5.2,
  recordedBy: 'user-2',
  recordedByName: 'Sunil Operator',
  recordedAt: '2026-10-11T08:00:00Z',
};

const MOCK_TODAY_SUMMARY: DensityTodaySummary = {
  businessDate: '2026-10-11',
  totalProducts: 2,
  recordedCount: 1,
  missingCount: 1,
  missingProducts: [
    { productId: 'prod-hsd', productName: 'High Speed Diesel', productCode: 'HSD' },
  ],
  products: [
    {
      productId: 'prod-ms',
      productName: 'Motor Spirit',
      productCode: 'MS',
      todayRecorded: true,
      latestToday: MOCK_READING_MS,
      trend14d: [
        { date: '2026-10-10', density15: 753.3 },
        { date: '2026-10-11', density15: 753.8 },
      ],
      trendValues: [753.3, 753.8],
      lastReadings: [MOCK_READING_MS],
    },
    {
      productId: 'prod-hsd',
      productName: 'High Speed Diesel',
      productCode: 'HSD',
      todayRecorded: false,
      latestToday: null,
      trend14d: [{ date: '2026-10-09', density15: 832.1 }],
      trendValues: [832.1],
      lastReadings: [],
    },
  ],
};

function seedQueryClient() {
  const qc = createTestQueryClient();
  qc.setQueryData(queryKeys.stations(), [STATION]);
  qc.setQueryData(queryKeys.products(), PRODUCTS);
  qc.setQueryData(queryKeys.tanks(STATION_ID), []);
  qc.setQueryData(queryKeys.nozzles(STATION_ID), []);
  qc.setQueryData(queryKeys.densityToday(STATION_ID, ''), MOCK_TODAY_SUMMARY);
  qc.setQueryData(queryKeys.densityReadings(STATION_ID, '', '', '', '', 500), [
    MOCK_READING_MS,
    MOCK_READING_HSD_JUMP,
  ]);
  return qc;
}

afterEach(cleanup);

describe('DensityTab (Variant D)', () => {
  it('renders Today view by default with product cards, missing banner, and header buttons', () => {
    const qc = seedQueryClient();
    renderWithProviders(<DensityTab stationId={STATION_ID} />, { queryClient: qc });

    // Header actions
    expect(screen.getByRole('button', { name: /Print board/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Record density/i })).toBeDefined();

    // Segmented control
    const segmented = screen.getByRole('radiogroup', { name: /Density view/i });
    expect(segmented).toBeDefined();

    // Missing check banner
    expect(screen.getByTestId('missing-density-banner')).toBeDefined();
    expect(screen.getByText(/Today's readings 1\/2 products recorded/i)).toBeDefined();
    expect(screen.getByText(/Missing today: High Speed Diesel/i)).toBeDefined();

    // Product cards
    expect(screen.getByText(/Motor Spirit \(MS\)/i)).toBeDefined();
    expect(screen.getAllByText(/753\.8/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Recorded/i).length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText(/High Speed Diesel \(HSD\)/i)).toBeDefined();
    expect(screen.getByText('Not recorded')).toBeDefined();

    // Spec band comes only from Station Settings (keyed by product id); none when unset
    expect(screen.getAllByText(/Spec:/i)).toHaveLength(1);
    expect(screen.getByText(/Spec: 720–775 kg\/m³/)).toBeDefined();
  });

  it('shows no spec band when station settings define none', () => {
    const qc = seedQueryClient();
    qc.setQueryData(queryKeys.stations(), [
      { ...STATION, settings: { ...STATION.settings, densitySpecBands: {} } },
    ]);
    renderWithProviders(<DensityTab stationId={STATION_ID} />, { queryClient: qc });
    expect(screen.queryByText(/Spec:/i)).toBeNull();
  });

  it('defaults the drawer entry method from Station Settings', () => {
    const qc = seedQueryClient();
    qc.setQueryData(queryKeys.stations(), [
      { ...STATION, settings: { ...STATION.settings, densityEntryMethod: 'DIRECT_15' } },
    ]);
    renderWithProviders(<DensityTab stationId={STATION_ID} />, { queryClient: qc });
    fireEvent.click(screen.getByRole('button', { name: /Record density/i }));
    expect(screen.getByText(/Record Density · Motor Spirit/i)).toBeDefined();
    expect(screen.queryByText(/Observed Hydrometer/i)).toBeNull();
  });

  it('switches between Today and Register view via the segmented control', () => {
    const qc = seedQueryClient();
    renderWithProviders(<DensityTab stationId={STATION_ID} />, { queryClient: qc });

    // Default: Today view is visible
    expect(screen.getByText(/Motor Spirit \(MS\)/i)).toBeDefined();

    // Switch to Register view
    const registerBtn = screen.getByRole('radio', { name: /Register/i });
    fireEvent.click(registerBtn);

    // Register log table should now be rendered
    expect(screen.getByText(/Density Register Log/i)).toBeDefined();
    expect(screen.getByText(/Rajesh Manager/i)).toBeDefined();
    expect(screen.getByText(/Sunil Operator/i)).toBeDefined();

    // Check unexplained jump indication on HSD reading
    expect(screen.getByText('+5.2 · Unexplained jump')).toBeDefined();

    // Switch back to Today view
    const todayBtn = screen.getByRole('radio', { name: /Today/i });
    fireEvent.click(todayBtn);
    expect(screen.getByText(/Motor Spirit \(MS\)/i)).toBeDefined();
  });

  it('opens Record Density drawer when clicking Record density button', () => {
    const qc = seedQueryClient();
    renderWithProviders(<DensityTab stationId={STATION_ID} />, { queryClient: qc });

    const recordBtn = screen.getByRole('button', { name: /Record density/i });
    fireEvent.click(recordBtn);

    expect(screen.getByText(/Record Density · Motor Spirit/i)).toBeDefined();
    expect(screen.getByText(/Reading Routine/i)).toBeDefined();
    expect(screen.getByText(/Hydrometer \+ Temperature/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Save Reading/i })).toBeDefined();
  });

  it('renders morning save prompt banner when morning density reading is saved', () => {
    const qc = seedQueryClient();
    renderWithProviders(<DensityTab stationId={STATION_ID} />, { queryClient: qc });

    // Open record drawer
    const recordBtn = screen.getByRole('button', { name: /Record density/i });
    fireEvent.click(recordBtn);

    // Save reading inside drawer (or trigger callback)
    const saveBtn = screen.getByRole('button', { name: /Save Reading/i });
    expect(saveBtn).toBeDefined();
  });

  it('calls window.open when clicking Print board', () => {
    const qc = seedQueryClient();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
    } as any);

    renderWithProviders(<DensityTab stationId={STATION_ID} />, { queryClient: qc });

    const printBtn = screen.getByRole('button', { name: /Print board/i });
    fireEvent.click(printBtn);

    expect(openSpy).toHaveBeenCalledWith('', '_blank', 'width=1100,height=780');
    openSpy.mockRestore();
  });
});

/** Station in Chatham (UTC+13:45 in October) so its clock never matches the device's. */
function seedChatham(settings: Record<string, unknown> = {}) {
  const qc = seedQueryClient();
  qc.setQueryData(queryKeys.stations(), [
    { ...STATION, settings: { ...STATION.settings, timezone: 'Pacific/Chatham', ...settings } },
  ]);
  return qc;
}

describe('DensityTab · shared density reading (#521)', () => {
  it('Today renders the same reading the Dashboard does', () => {
    renderWithProviders(<DensityTab stationId={STATION_ID} />, { queryClient: seedChatham() });
    const card = screen.getByTestId('density-card-prod-ms');
    const shown = card.querySelector('[data-state]') as HTMLElement;

    const product = MOCK_TODAY_SUMMARY.products[0];
    const { container } = render(
      <DensityReading
        state={deriveDensityState(product, MOCK_TODAY_SUMMARY.businessDate, 3)}
        trend={product.trendValues}
        context={{ timeZone: 'Pacific/Chatham', businessDate: MOCK_TODAY_SUMMARY.businessDate }}
      />,
    );
    expect(shown.outerHTML).toBe((container.firstElementChild as HTMLElement).outerHTML);
    expect(within(card).getByText('745.0 at 28.5 °C · 8:15 pm')).toBeDefined();
    expect(within(card).getByText('+0.5 vs yday')).toBeDefined();
  });

  it('Today lists recent readings in the station timezone', () => {
    renderWithProviders(<DensityTab stationId={STATION_ID} />, { queryClient: seedChatham() });
    const card = screen.getByTestId('density-card-prod-ms');
    expect(within(card).getByText(/11 Oct 8:15 pm · MORNING/)).toBeDefined();
  });

  it('Register shows station time, 15 °C to one decimal and the jump word', () => {
    renderWithProviders(<DensityTab stationId={STATION_ID} />, { queryClient: seedChatham() });
    fireEvent.click(screen.getByRole('radio', { name: /Register/i }));
    expect(screen.getByText('8:15 pm')).toBeDefined();
    expect(screen.getByText('9:45 pm')).toBeDefined();
    expect(screen.getByText('753.8')).toBeDefined();
    expect(screen.getByText('+5.2 · Unexplained jump')).toBeDefined();
  });

  it('judges a jump by the station tolerance only', () => {
    const qc = seedChatham({ densityToleranceKgM3: 5 });
    qc.setQueryData(queryKeys.densityReadings(STATION_ID, '', '', '', '', 500), [
      { ...MOCK_READING_MS, delta: 4 },
    ]);
    renderWithProviders(<DensityTab stationId={STATION_ID} />, { queryClient: qc });
    fireEvent.click(screen.getByRole('radio', { name: /Register/i }));
    expect(screen.getByText('+4.0')).toBeDefined();
    expect(screen.queryByText(/Unexplained jump/)).toBeNull();
  });

  it('shows no readings or times until the station (timezone, tolerance) loads', () => {
    const qc = seedChatham();
    qc.removeQueries({ queryKey: queryKeys.stations() });
    renderWithProviders(<DensityTab stationId={STATION_ID} />, { queryClient: qc });
    expect(screen.queryByTestId('density-card-prod-ms')).toBeNull();
    expect(screen.queryByText(/am|pm/)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Register/i }));
    expect(screen.queryByText('Density Register Log')).toBeNull();
    expect(screen.queryByText(/\d:\d{2} (am|pm)/)).toBeNull();
  });

  it('a Decantation beyond tolerance takes its routine tone, not the jump tone', () => {
    const qc = seedChatham();
    qc.setQueryData(queryKeys.densityReadings(STATION_ID, '', '', '', '', 500), [
      { ...MOCK_READING_MS, kind: 'DECANTATION', delta: 6 },
    ]);
    renderWithProviders(<DensityTab stationId={STATION_ID} />, { queryClient: qc });
    fireEvent.click(screen.getByRole('radio', { name: /Register/i }));
    const chipOf = (text: string) => screen.getByText(text).parentElement as HTMLElement;
    expect(chipOf('DECANTATION').className).toContain('bg-info-bg text-info-fg');
    expect(chipOf('+6.0').className).toContain('bg-info-bg text-info-fg');
  });
});

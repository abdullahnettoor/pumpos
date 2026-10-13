/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders.js';

const range = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock('../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDailyDssrRange: () => ({ data: range.data, isLoading: false, error: null }),
}));
vi.mock('../access/CapabilityGate.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCapability: () => ({ status: 'enabled' }),
}));

const { ReportsOverview } = await import('./ReportsOverview.js');

afterEach(() => {
  cleanup();
  range.data = [];
});

const station = { id: 'st-1', name: 'Station', settings: {} };

describe('Reports → Templates tab (#332)', () => {
  it.each(['Owner', 'Manager'] as const)('is shown to %s', (role) => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole={role} />);
    expect(screen.getByRole('tab', { name: /Templates/ })).toBeTruthy();
  });

  it.each(['Accountant', 'Staff'] as const)('is hidden from %s', (role) => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole={role} />);
    expect(screen.queryByRole('tab', { name: /Templates/ })).toBeNull();
    expect(screen.getByRole('tab', { name: /Daily DSSR/ })).toBeTruthy();
  });
});

describe('Reports → Decantations tab (#473)', () => {
  it.each(['Owner', 'Manager', 'Accountant'] as const)('is shown to %s', (role) => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole={role} />);
    expect(screen.getByRole('tab', { name: /Decantations/ })).toBeTruthy();
  });

  it('is hidden from Staff', () => {
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Staff" />);
    expect(screen.queryByRole('tab', { name: /Decantations/ })).toBeNull();
  });
});

describe('Reports → Daily DSSR KPI strip (#516)', () => {
  /** Closed days as `composeDssr` freezes them. */
  const day = (businessDate: string, snapshotData: Record<string, unknown>) => ({
    id: businessDate,
    businessDate,
    snapshotData,
  });
  const fuel = (diesel: number, petrol: number) => ({
    totalVolume: diesel + petrol + 20,
    totalNetVolume: diesel + petrol,
    byProduct: [
      { productName: 'Diesel', unit: 'L', netVolume: diesel, salesValue: diesel * 90 },
      { productName: 'Petrol', unit: 'L', netVolume: petrol, salesValue: petrol * 103 },
    ],
  });
  const tile = (label: string) =>
    // The KPI strip comes before the table, which repeats "Net Volume Sold" as a header.
    (screen.getAllByText(label)[0].parentElement as HTMLElement).parentElement as HTMLElement;

  it('shows the net volume and cash sales of the closed days in range', () => {
    range.data = [
      day('2026-10-09', { shiftsIncluded: 2, fuel: fuel(1120, 1060), cashSales: 71275 }),
      day('2026-10-10', { shiftsIncluded: 2, fuel: fuel(1000, 900), cashSales: 64275.5 }),
    ];
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(tile('Net Volume Sold').textContent).toContain('4,080 L');
    expect(tile('Cash sales').textContent).toContain('1,35,550.50');
    expect(screen.queryByText('Cash Collected')).toBeNull();
  });

  it('still reads volume from a snapshot frozen before the net roll-up and cash sales', () => {
    range.data = [day('2026-09-01', { totalVolumeSold: 500 })];
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(tile('Net Volume Sold').textContent).toContain('500 L');
    expect(tile('Cash sales').textContent).toContain('—');
  });

  it('lists each day\'s cash sales so the tile is traceable, "—" for days without it', () => {
    range.data = [
      day('2026-10-09', { shiftsIncluded: 2, fuel: fuel(1120, 1060), cashSales: 71275 }),
      day('2026-09-01', { totalVolumeSold: 500 }),
    ];
    renderWithProviders(<ReportsOverview selectedStation={station} userRole="Owner" />);
    expect(screen.getByRole('columnheader', { name: /Cash sales/ })).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    const cashCell = (r: HTMLElement) => {
      const headers = screen.getAllByRole('columnheader');
      const i = headers.findIndex((h) => /Cash sales/.test(h.textContent ?? ''));
      return r.querySelectorAll('td')[i].textContent;
    };
    expect(rows.map(cashCell)).toEqual(['₹71,275.00', '—']);
  });
});

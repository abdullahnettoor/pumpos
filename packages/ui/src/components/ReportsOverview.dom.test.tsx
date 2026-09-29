/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders.js';

vi.mock('../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDailyDssrRange: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock('../access/CapabilityGate.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCapability: () => ({ status: 'enabled' }),
}));

const { ReportsOverview } = await import('./ReportsOverview.js');

afterEach(cleanup);

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

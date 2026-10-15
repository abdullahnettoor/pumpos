// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
};

const sales = [
  {
    id: 's1',
    businessDate: '2026-10-02',
    documentNumber: 'SAL-0001',
    saleType: 'Merchandise',
    customerName: null,
    totalAmount: 500,
    invoiceNumber: null,
  },
  {
    id: 's2',
    businessDate: '2026-10-05',
    documentNumber: 'SAL-0002',
    saleType: 'Merchandise',
    customerName: 'Acme Logistics',
    totalAmount: 1200,
    invoiceNumber: 'INV-0001',
  },
];

const ok = (data: unknown) => ({
  data,
  isPending: false,
  isLoading: false,
  isError: false,
  fetchStatus: 'idle' as const,
  refetch: vi.fn(),
});
let query: Record<string, unknown> = ok(sales);

vi.mock('../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSales: () => query,
}));

const { InvoicesPanel } = await import('./InvoicesPanel.js');

describe('InvoicesPanel', () => {
  afterEach(() => {
    cleanup();
    query = ok(sales);
  });

  it('lists merchandise sales newest first with a total and in-range tiles', () => {
    renderWithProviders(<InvoicesPanel selectedStation={station} userRole="Owner" />);
    expect(screen.getAllByText('In range')).toHaveLength(3);
    const section = screen.getByTestId('section-header-product-invoices').parentElement!;
    const bodyRows = section.querySelectorAll('tbody tr');
    expect(within(bodyRows[0] as HTMLElement).getByText('Acme Logistics')).toBeTruthy();
    expect(within(bodyRows[1] as HTMLElement).getByText('Walk-in')).toBeTruthy();
    const foot = section.querySelector('tfoot') as HTMLElement;
    expect(within(foot).getByText('₹1,700.00')).toBeTruthy();
    expect(screen.getByRole('button', { name: /PDF/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Issue/ })).toBeTruthy();
  });

  it('shows the empty state only after a successful load', () => {
    query = ok([]);
    renderWithProviders(<InvoicesPanel selectedStation={station} userRole="Owner" />);
    expect(screen.getByText('No product sales')).toBeTruthy();
  });

  it('keeps Staff from issuing a new invoice', () => {
    renderWithProviders(<InvoicesPanel selectedStation={station} userRole="Staff" />);
    expect(screen.getByRole('button', { name: /Issue/ }).hasAttribute('disabled')).toBe(true);
  });
});

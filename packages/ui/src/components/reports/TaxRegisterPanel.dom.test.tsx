// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders.js';

const station = {
  id: 'st-1',
  name: 'Highway Fuels',
  settings: { timezone: 'Asia/Kolkata', business_day_starts_at: '06:00' },
};

const rows = [
  {
    id: 'g1',
    businessDate: '2026-10-03',
    documentNumber: 'SAL-0001',
    productName: 'Engine oil 1L',
    hsnCode: '2710',
    customerName: 'Walk-in',
    quantity: 2,
    taxCategory: 'GST',
    gstRate: 18,
    interState: false,
    taxableAmount: 1000,
    cgst: 90,
    sgst: 90,
    igst: 0,
    cess: 0,
    lineTotal: 1180,
  },
  {
    id: 'v1',
    businessDate: '2026-10-04',
    documentNumber: 'SAL-0002',
    productName: 'Diesel',
    quantity: 50,
    taxCategory: 'FUEL_VAT',
    vatRate: 25,
    taxableAmount: 4000,
    vat: 1000,
    lineTotal: 5000,
  },
];

let query: Record<string, unknown> = {};
const ok = (data: unknown) => ({
  data,
  isPending: false,
  isLoading: false,
  isError: false,
  fetchStatus: 'idle' as const,
  refetch: vi.fn(),
});

vi.mock('../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSalesTaxRegister: () => query,
}));

const { TaxRegisterPanel } = await import('./TaxRegisterPanel.js');

const sectionOf = (testId: string) => screen.getByTestId(testId).parentElement!;

describe('TaxRegisterPanel', () => {
  afterEach(() => {
    cleanup();
    query = ok(rows);
  });

  it('drives in-range tiles and both registers from one control bar', () => {
    query = ok(rows);
    renderWithProviders(<TaxRegisterPanel selectedStation={station} />);
    expect(screen.getAllByTestId('control-bar')).toHaveLength(1);
    // The range control right above names the period: no caption, no chips (#604).
    expect(screen.queryByText('In range')).toBeNull();

    const gst = sectionOf('section-header-gst-on-product-sales');
    expect(within(gst).getByText('HSN 2710')).toBeTruthy();
    const gstFoot = gst.querySelector('tfoot') as HTMLElement;
    expect(within(gstFoot).getByText('Total')).toBeTruthy();
    expect(within(gstFoot).getByText('₹1,180.00')).toBeTruthy();

    const vat = sectionOf('section-header-vat-on-fuel-sales');
    expect(within(vat).getByText('4 Oct 2026')).toBeTruthy();
    expect(vat.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(within(vat).getAllByText('50.00 L').length).toBeGreaterThan(0);
    const vatFoot = vat.querySelector('tfoot') as HTMLElement;
    expect(within(vatFoot).getByText('₹5,000.00')).toBeTruthy();
  });

  it('shows each register empty on its own', () => {
    query = ok([rows[0]]);
    renderWithProviders(<TaxRegisterPanel selectedStation={station} />);
    expect(screen.getByText('No VAT fuel lines in this period')).toBeTruthy();
    expect(screen.queryByText('No GST sales in this period')).toBeNull();
  });

  it('puts a failed load behind Retry, not an empty state', () => {
    query = {
      ...ok(undefined),
      isError: true,
      error: new Error('boom'),
    };
    renderWithProviders(<TaxRegisterPanel selectedStation={station} />);
    expect(screen.getAllByRole('button', { name: /retry/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText('No GST sales in this period')).toBeNull();
  });
});

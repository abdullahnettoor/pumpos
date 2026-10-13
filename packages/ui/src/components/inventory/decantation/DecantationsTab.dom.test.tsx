/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { DecantationView } from '@pump/shared';
import { renderWithProviders } from '../../../test/renderWithProviders.js';

const tanks = [
  { id: 't-ms', name: 'Tank 1', productId: 'p-ms', productName: 'MS', currentVolume: 8000 },
  { id: 't-hsd', name: 'Tank 2', productId: 'p-hsd', productName: 'HSD', currentVolume: 5000 },
  { id: 't-hsd2', name: 'Tank 3', productId: 'p-hsd', productName: 'HSD', currentVolume: 2000 },
];

const line = (over: Partial<DecantationView['lines'][number]>) => ({
  id: 'l',
  tankId: 't-hsd',
  productId: 'p-hsd',
  beforeDip: 4000,
  beforeDipAt: null,
  observedDensity: null,
  observedTempC: null,
  roDensity: null,
  afterDip: null,
  afterDipAt: null,
  salesDuring: 0,
  receivedQty: null,
  status: 'PENDING_MEASUREMENT' as const,
  ...over,
});
const visit = (over: Partial<DecantationView>): DecantationView => ({
  id: 'd',
  stationId: 'st-1',
  businessDayId: 'bd',
  businessDate: '2026-10-11',
  documentNumber: 'DEC-1',
  tankerNumber: 'KL-1',
  driverName: null,
  unloadStartedAt: null,
  unloadEndedAt: null,
  chambersChecked: false,
  status: 'PENDING_MEASUREMENT',
  flags: [],
  notes: null,
  createdAt: '2026-10-11T04:00:00.000Z',
  updatedAt: '',
  lines: [],
  chambers: [],
  ...over,
});

let decantations: DecantationView[] = [];
vi.mock('../../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDecantations: () => ({ data: decantations, isLoading: false, error: null }),
  useInventoryStatus: () => ({ data: tanks }),
  useLinkablePurchases: () => [],
  useInvalidateOperational: () => async () => {},
}));
vi.mock('./DecantationDrawer.js', () => ({
  DecantationDrawer: (p: { isOpen: boolean; decantation?: DecantationView | null }) =>
    p.isOpen ? <div data-testid="drawer">{p.decantation?.documentNumber ?? 'new'}</div> : null,
}));
vi.mock('./LinkPurchaseDrawer.js', () => ({
  LinkPurchaseDrawer: (p: { decantation: DecantationView | null }) =>
    p.decantation ? <div data-testid="link-drawer">{p.decantation.documentNumber}</div> : null,
}));

const { DecantationsTab } = await import('./DecantationsTab.js');
const station = { id: 'st-1', settings: {} };
const open = (role: 'Owner' | 'Manager' = 'Owner') =>
  renderWithProviders(<DecantationsTab station={station} userRole={role} />);

beforeEach(() => {
  decantations = [
    visit({
      id: 'a',
      documentNumber: 'DEC-A',
      tankerNumber: 'KL-07-A',
      lines: [
        line({ id: 'a1', tankId: 't-ms', productId: 'p-ms' }),
        line({ id: 'a2', tankId: 't-hsd', productId: 'p-hsd' }),
        line({ id: 'a3', tankId: 't-hsd2', productId: 'p-hsd' }),
      ],
      links: [
        {
          productId: 'p-hsd',
          purchaseId: 'x',
          invoiceNumber: 'INV-1',
          supplierName: null,
          invoiceQty: 12000,
          invoiceDensity: 830,
          receivedQty: null,
          varianceQty: null,
          varianceComputedAt: null,
        },
      ],
      unlinkedProductIds: ['p-ms'],
    }),
    visit({
      id: 'b',
      documentNumber: 'DEC-B',
      tankerNumber: 'KL-07-B',
      status: 'MEASURED',
      flags: [{ code: 'TANKER_SHORT', chamberNo: 1, message: 'Tanker short: chamber 1 short' }],
      lines: [line({ id: 'b1', receivedQty: 5900, roDensity: 835, status: 'MEASURED' })],
      links: [
        {
          productId: 'p-hsd',
          purchaseId: 'y',
          invoiceQty: 6000,
          invoiceNumber: 'INV-2',
          supplierName: null,
          invoiceDensity: 830,
          receivedQty: 5900,
          varianceQty: -100,
          varianceComputedAt: 'now',
        },
      ],
      unlinkedProductIds: [],
    }),
  ];
});
afterEach(cleanup);

describe('DecantationsTab', () => {
  it('shows one row per tanker visit with its tank lines grouped', () => {
    open();
    const rowA = screen.getByText('KL-07-A').closest('tr')!;
    // Three tank lines, one row.
    expect(within(rowA).getByText(/Tank 1/)).toBeTruthy();
    expect(within(rowA).getByText(/Tank 2/)).toBeTruthy();
    expect(within(rowA).getByText(/Tank 3/)).toBeTruthy();
    expect(within(rowA).getByText('Pending measurement')).toBeTruthy();
    expect(within(rowA).getByText('12,000.00 L')).toBeTruthy();
    // MS purchase is not linked; HSD is.
    expect(within(rowA).getByText(/Purchase not linked/)).toBeTruthy();
    expect(screen.getAllByRole('row').length).toBe(3); // header + 2 visits
  });

  it('shows Short with the quantity, density status and the flag on a measured visit', () => {
    open();
    const rowB = screen.getByText('KL-07-B').closest('tr')!;
    expect(within(rowB).getByText('Measured')).toBeTruthy();
    expect(within(rowB).getByText(/Short/)).toBeTruthy();
    expect(within(rowB).getByText(/100.00 L/)).toBeTruthy();
    expect(within(rowB).getByText(/\+5(\.0)? kg\/m³/)).toBeTruthy();
    expect(within(rowB).getByText(/Tanker short/)).toBeTruthy();
  });

  it('tells the Owner about flagged Decantations; others do not get the review banner', () => {
    const { unmount } = open('Owner');
    expect(screen.getByText(/1 flagged Decantation/)).toBeTruthy();
    unmount();
    open('Manager');
    expect(screen.queryByText(/flagged Decantation need/)).toBeNull();
  });

  it('filters to flagged visits', () => {
    open();
    fireEvent.click(screen.getByRole('radio', { name: /Flagged/ }));
    expect(screen.queryByText('KL-07-A')).toBeNull();
    expect(screen.getByText('KL-07-B')).toBeTruthy();
  });

  it('opens the drawer for a new visit and for a pending row, and links later from the row', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /New Decantation/ }));
    expect(screen.getByTestId('drawer').textContent).toBe('new');
    cleanup();
    open();
    fireEvent.click(screen.getByText('KL-07-A'));
    expect(screen.getByTestId('drawer').textContent).toBe('DEC-A');
    cleanup();
    open();
    fireEvent.click(screen.getByRole('button', { name: /Link purchase.*MS/ }));
    expect(screen.getByTestId('link-drawer').textContent).toBe('DEC-A');
    expect(screen.queryByTestId('drawer')).toBeNull();
  });
});

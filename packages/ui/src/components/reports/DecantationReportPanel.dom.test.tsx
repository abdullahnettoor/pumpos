// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { DecantationReport } from '@pump/shared';
import { renderWithProviders } from '../../test/renderWithProviders.js';

/** Fills the server-composed fields the fixtures below do not spell out. */
function hydrate(raw: any): DecantationReport {
  const visits = raw.visits.map((v: any) => ({
    ...v,
    chambers: v.chambers.map((c: any) => ({ tankLineId: null, ...c })),
    invoiceLinks: v.invoiceLinks.map((i: any) => ({
      purchaseDocumentNumber: null,
      linkedVisitCount: i.purchaseId ? 1 : 0,
      ...i,
    })),
    summary: v.summary ?? {
      shortChambers: v.chamberSummary.shortCount,
      excessChambers: v.chamberSummary.excessCount,
      notEmptiedChambers: v.chamberSummary.notEmptiedCount,
      sealsBroken: v.chamberSummary.sealsBrokenCount,
      transitDiscrepancies:
        v.chamberSummary.shortCount +
        v.chamberSummary.excessCount +
        v.chamberSummary.notEmptiedCount +
        v.chamberSummary.sealsBrokenCount,
      settledInvoiceVarianceQty: null,
      settlingInvoiceCount: 0,
    },
  }));
  return {
    invoices: [],
    ...raw,
    visits,
    productTotals: raw.productTotals.map((p: any) => ({
      settledReceivedQty: p.totalReceivedQty,
      pendingInvoiceQty: 0,
      pendingReceivedQty: 0,
      ...p,
    })),
    totals: {
      flaggedVisits: 0,
      settledReceivedQty: raw.totals.totalReceivedQty,
      pendingInvoiceQty: 0,
      pendingReceivedQty: 0,
      settlingInvoiceCount: 0,
      totalChambersExcess: 0,
      transitDiscrepancies:
        raw.totals.totalChambersShort +
        raw.totals.totalChambersNotEmptied +
        raw.totals.totalSealsBroken,
      ...raw.totals,
    },
  };
}

const mockReport: DecantationReport = hydrate({
  stationId: 'st-1',
  stationName: 'Highway Fuels',
  from: '2026-03-01',
  to: '2026-03-10',
  generatedAt: '2026-03-11T08:00:00.000Z',
  visits: [
    {
      id: 'dec-1',
      date: '2026-03-05',
      documentNumber: 'DEC-2026-001',
      tankerNumber: 'KA-01-AA-1111',
      driverName: 'Ramesh Kumar',
      status: 'MEASURED',
      unloadStartedAt: '2026-03-05T10:00:00.000Z',
      unloadEndedAt: '2026-03-05T11:30:00.000Z',
      flags: [{ code: 'CHAMBER_SHORT', chamberNo: 1, message: 'Compartment short 10mm' }],
      notes: 'Decanted into Tank 1 and Tank 2',
      chamberSummary: {
        totalChambers: 3,
        shortCount: 1,
        excessCount: 0,
        notEmptiedCount: 1,
        sealsBrokenCount: 1,
        hasTransitDiscrepancy: true,
      },
      chambers: [
        {
          id: 'ch-1',
          chamberNo: 1,
          capacityL: 4000,
          sealOk: true,
          mark: 'SHORT',
          dipMm: 990,
          emptied: true,
          tankName: 'Tank 1',
        },
        {
          id: 'ch-2',
          chamberNo: 2,
          capacityL: 4000,
          sealOk: true,
          mark: 'OK',
          dipMm: 1000,
          emptied: false,
          tankName: 'Tank 1',
        },
        {
          id: 'ch-3',
          chamberNo: 3,
          capacityL: 2000,
          sealOk: false,
          mark: 'OK',
          dipMm: 500,
          emptied: true,
          tankName: 'Tank 2',
        },
      ],
      tankLines: [
        {
          id: 'tl-1',
          tankId: 'tank-1',
          tankName: 'Tank 1',
          productId: 'prod-ms',
          productName: 'Motor Spirit',
          productCode: 'MS',
          beforeDip: 1000,
          beforeDipAt: '2026-03-05T10:00:00.000Z',
          afterDip: 9000,
          afterDipAt: '2026-03-05T11:30:00.000Z',
          salesDuring: 100,
          receivedQty: 8100,
          roDensity: 750.5,
          invoiceDensity: 750.0,
          densityDeviation: 0.5,
          measuredBy: 'AFTER_DIP',
          measuredAt: '2026-03-05T11:30:00.000Z',
          status: 'MEASURED',
        },
      ],
      invoiceLinks: [
        {
          purchaseId: 'purch-1',
          productId: 'prod-ms',
          productName: 'Motor Spirit',
          productCode: 'MS',
          invoiceNumber: 'INV-IOCL-9001',
          invoiceQty: 8150,
          receivedQty: 8100,
          varianceQty: -50,
          varianceType: 'SHORT',
          status: 'LINKED',
          statusLabel: 'Short',
        },
      ],
    },
    {
      id: 'dec-2',
      date: '2026-03-06',
      documentNumber: 'DEC-2026-002',
      tankerNumber: 'KA-01-BB-2222',
      driverName: 'Suresh',
      status: 'PENDING_MEASUREMENT',
      unloadStartedAt: '2026-03-06T14:00:00.000Z',
      unloadEndedAt: null,
      flags: [],
      notes: null,
      chamberSummary: {
        totalChambers: 2,
        shortCount: 0,
        excessCount: 0,
        notEmptiedCount: 0,
        sealsBrokenCount: 0,
        hasTransitDiscrepancy: false,
      },
      chambers: [
        {
          id: 'ch-4',
          chamberNo: 1,
          capacityL: 5000,
          sealOk: true,
          mark: 'OK',
          dipMm: 1200,
          emptied: true,
          tankName: 'Tank 2',
        },
      ],
      tankLines: [
        {
          id: 'tl-2',
          tankId: 'tank-2',
          tankName: 'Tank 2',
          productId: 'prod-hsd',
          productName: 'High Speed Diesel',
          productCode: 'HSD',
          beforeDip: 2000,
          beforeDipAt: null,
          afterDip: null,
          afterDipAt: null,
          salesDuring: 0,
          receivedQty: null,
          roDensity: null,
          invoiceDensity: 830.0,
          densityDeviation: null,
          measuredBy: null,
          measuredAt: null,
          status: 'PENDING_MEASUREMENT',
        },
      ],
      invoiceLinks: [
        {
          purchaseId: 'purch-2',
          productId: 'prod-hsd',
          productName: 'High Speed Diesel',
          productCode: 'HSD',
          invoiceNumber: 'INV-IOCL-9002',
          invoiceQty: 5000,
          receivedQty: null,
          varianceQty: null,
          varianceType: null,
          status: 'PENDING_MEASUREMENT',
          statusLabel: 'Pending measurement',
        },
      ],
    },
    {
      id: 'dec-3',
      date: '2026-03-07',
      documentNumber: 'DEC-2026-003',
      tankerNumber: 'KA-01-CC-3333',
      driverName: 'Manoj',
      status: 'MEASURED',
      unloadStartedAt: null,
      unloadEndedAt: null,
      flags: [],
      notes: null,
      chamberSummary: {
        totalChambers: 1,
        shortCount: 0,
        excessCount: 0,
        notEmptiedCount: 0,
        sealsBrokenCount: 0,
        hasTransitDiscrepancy: false,
      },
      chambers: [],
      tankLines: [
        {
          id: 'tl-3',
          tankId: 'tank-1',
          tankName: 'Tank 1',
          productId: 'prod-ms',
          productName: 'Motor Spirit',
          productCode: 'MS',
          beforeDip: 1500,
          beforeDipAt: null,
          afterDip: 6500,
          afterDipAt: null,
          salesDuring: 0,
          receivedQty: 5000,
          roDensity: 749.0,
          invoiceDensity: null,
          densityDeviation: null,
          measuredBy: 'AFTER_DIP',
          measuredAt: null,
          status: 'MEASURED',
        },
      ],
      invoiceLinks: [
        {
          purchaseId: null,
          productId: 'prod-ms',
          productName: 'Motor Spirit',
          productCode: 'MS',
          invoiceNumber: null,
          invoiceQty: null,
          receivedQty: 5000,
          varianceQty: null,
          varianceType: null,
          status: 'NOT_LINKED',
          statusLabel: 'Purchase not linked',
        },
      ],
    },
  ],
  productTotals: [
    {
      productId: 'prod-ms',
      productName: 'Motor Spirit',
      productCode: 'MS',
      totalReceivedQty: 13100,
      totalInvoiceQty: 8150,
      totalVarianceQty: -50,
      shortVarianceQty: 50,
      excessVarianceQty: 0,
      visitCount: 2,
      lineCount: 2,
      measuredLineCount: 2,
      pendingLineCount: 0,
    },
    {
      productId: 'prod-hsd',
      productName: 'High Speed Diesel',
      productCode: 'HSD',
      totalReceivedQty: 0,
      totalInvoiceQty: 5000,
      totalVarianceQty: 0,
      shortVarianceQty: 0,
      excessVarianceQty: 0,
      visitCount: 1,
      lineCount: 1,
      measuredLineCount: 0,
      pendingLineCount: 1,
    },
  ],
  totals: {
    totalVisits: 3,
    measuredVisits: 2,
    pendingVisits: 1,
    totalReceivedQty: 13100,
    totalInvoiceQty: 13150,
    totalVarianceQty: -50,
    totalChambersShort: 1,
    totalChambersNotEmptied: 1,
    totalSealsBroken: 1,
  },
});

let currentReport: DecantationReport | undefined = mockReport;

vi.mock('../../query/hooks.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDecantationReport: () => ({
    data: currentReport,
    isPending: false,
    isLoading: false,
    isError: false,
    fetchStatus: 'idle',
    error: null,
    refetch: vi.fn(),
  }),
}));

// Radix's menu popup loops forever in jsdom, so the Export menu renders open
// and inline; its items and their callbacks are what is under test.
vi.mock('../../pump-ds/menu/Menu.js', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    Menu: Pass,
    MenuTrigger: Pass,
    MenuContent: ({ children }: { children?: React.ReactNode }) => (
      <div role="menu">{children}</div>
    ),
    MenuItem: ({ children, onSelect }: { children?: React.ReactNode; onSelect?: () => void }) => (
      <div role="menuitem" tabIndex={-1} onClick={() => onSelect?.()}>
        {children}
      </div>
    ),
  };
});

const outputReactPdf = vi.fn(async (..._args: unknown[]) => {});
vi.mock('../../services/exportPdf.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  outputReactPdf: (...args: unknown[]) => outputReactPdf(...args),
}));

const { DecantationReportPanel } = await import('./DecantationReportPanel.js');

describe('DecantationReportPanel DOM tests', () => {
  afterEach(() => {
    cleanup();
    currentReport = mockReport;
    outputReactPdf.mockClear();
    vi.restoreAllMocks();
  });

  it('renders the tanker visits table with operational records, transit loss chips, and invoice variance', () => {
    renderWithProviders(
      <DecantationReportPanel selectedStation={{ id: 'st-1', name: 'Highway Fuels' }} />,
    );

    const table = screen.getByTestId('decantation-report-table');
    expect(table).toBeTruthy();

    // Check visit 1 (DEC-2026-001)
    expect(screen.getByText('DEC-2026-001')).toBeTruthy();
    expect(screen.getByText('KA-01-AA-1111')).toBeTruthy();
    expect(screen.getByText('Ramesh Kumar')).toBeTruthy();

    // Transit discrepancy chip
    expect(screen.getByText('Transit discrepancy')).toBeTruthy();
    expect(screen.getByText(/1 short · 1 seal broken · 1 unemptied/)).toBeTruthy();

    // Underground dip & density deviation
    expect(screen.getAllByText(/Tank 1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/8,100.00 L/).length).toBeGreaterThan(0);
    expect(screen.getByText(/RO: 750.5/)).toBeTruthy();
    expect(screen.getByText(/\(\+0.5\)/)).toBeTruthy();

    // Linked invoice variance
    expect(screen.getByText(/INV-IOCL-9001:/)).toBeTruthy();
    // The variance chip: the shared stock format (true minus), in the short tone.
    const shortChip = within(table).getByText('−50.00 L');
    expect(shortChip.closest('[data-variance]')?.getAttribute('data-variance')).toBe('short');

    // Visit statuses read in words, never the raw enum
    expect(screen.getAllByText('Measured').length).toBe(2);
    expect(screen.queryByText('MEASURED')).toBeNull();

    // Check visit 2 (Pending): the visit and its invoice link both wait on measurement
    expect(screen.getByText('DEC-2026-002')).toBeTruthy();
    expect(screen.getAllByText('Pending measurement').length).toBe(2);
    expect(screen.getByText('Pending dip')).toBeTruthy();

    // Check visit 3 (Unlinked)
    expect(screen.getByText('DEC-2026-003')).toBeTruthy();
    expect(screen.getByText('Purchase not linked')).toBeTruthy();
  });

  it('renders the product totals and KPI strip', () => {
    renderWithProviders(
      <DecantationReportPanel selectedStation={{ id: 'st-1', name: 'Highway Fuels' }} />,
    );

    // KPI strip: at most four tiles, each following the range
    expect(screen.getByText('Tanker visits')).toBeTruthy();
    expect(screen.getByText('Settled invoice volume')).toBeTruthy();
    expect(screen.getByText('Settled invoice variance')).toBeTruthy();
    expect(screen.getByText('Transit discrepancies')).toBeTruthy();
    expect(screen.getAllByText('In range').length).toBe(1);
    // Volume received is the visits table's total, not a tile
    expect(screen.queryByText('Volume received')).toBeNull();
    const visits = screen.getByTestId('decantation-report-table');
    expect(within(visits).getByText('Total received')).toBeTruthy();
    expect(within(visits).getByText('13,100.00 L')).toBeTruthy();

    // Totals by product
    expect(screen.getByText('Totals by product')).toBeTruthy();
    expect(screen.getByText('Motor Spirit')).toBeTruthy();
    expect(screen.getByText('High Speed Diesel')).toBeTruthy();
  });

  it('opens visit detail drawer on row click with chamber, dip, and invoice breakdowns', () => {
    renderWithProviders(
      <DecantationReportPanel selectedStation={{ id: 'st-1', name: 'Highway Fuels' }} />,
    );

    // Click on visit 1 row
    const docCell = screen.getByText('DEC-2026-001');
    fireEvent.click(docCell);

    // Drawer should open with header
    expect(screen.getByText('Tanker visit · KA-01-AA-1111')).toBeTruthy();
    expect(screen.getByText('Chamber inspection (transit)')).toBeTruthy();
    expect(screen.getByText('Underground tank dips')).toBeTruthy();
    expect(screen.getByText('Invoice reconciliation')).toBeTruthy();
    // The business date reads as a date, never the raw ISO form
    expect(screen.getAllByText('05 Mar 2026').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}(?!_)/);

    // Chambers details
    expect(screen.getByText('Chamber 1')).toBeTruthy();
    expect(screen.getByText('Chamber 2')).toBeTruthy();
    expect(screen.getByText('Chamber 3')).toBeTruthy();
    expect(screen.getByText('Broken')).toBeTruthy();
    expect(screen.getByText('Not emptied')).toBeTruthy();

    // Invoice details
    expect(screen.getByText('INV-IOCL-9001')).toBeTruthy();
    expect(screen.getAllByText('−50.00 L').length).toBeGreaterThan(1);
  });

  it('renders empty state when no visits exist', () => {
    currentReport = {
      ...mockReport,
      visits: [],
      productTotals: [],
      totals: {
        ...mockReport.totals,
        totalVisits: 0,
        measuredVisits: 0,
        pendingVisits: 0,
        totalReceivedQty: 0,
        totalInvoiceQty: 0,
        totalVarianceQty: 0,

        totalChambersShort: 0,
        totalChambersNotEmptied: 0,
        totalSealsBroken: 0,
      },
    };

    renderWithProviders(
      <DecantationReportPanel selectedStation={{ id: 'st-1', name: 'Highway Fuels' }} />,
    );

    expect(screen.getByText('No decantation records found')).toBeTruthy();
  });

  it('prints through the PDF path, not window.print (a no-op on desktop)', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderWithProviders(
      <DecantationReportPanel selectedStation={{ id: 'st-1', name: 'Highway Fuels' }} />,
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'Print' }));

    await waitFor(() => expect(outputReactPdf).toHaveBeenCalledTimes(1));
    const [element, filename, output] = outputReactPdf.mock.calls[0] as [any, string, string];
    expect(output).toBe('print');
    expect(filename).toBe('Decantation_Report_2026-03-01_2026-03-10');
    expect(element.props.report).toBe(mockReport);
    expect(element.props.stationName).toBe('Highway Fuels');
    expect(print).not.toHaveBeenCalled();
  });

  it('saves the same PDF from Export → PDF', async () => {
    renderWithProviders(
      <DecantationReportPanel selectedStation={{ id: 'st-1', name: 'Highway Fuels' }} />,
    );

    fireEvent.click(screen.getByRole('menuitem', { name: 'PDF' }));

    await waitFor(() => expect(outputReactPdf).toHaveBeenCalledTimes(1));
    expect(outputReactPdf.mock.calls[0][2]).toBe('save');
  });
});

import { describe, expect, it } from 'vitest';
import { composeDecantationReport, weightedInvoiceDensity } from './compose.js';
import { GetDecantationReport } from './get-decantation-report.js';
import type { DecantationReportReader, DecantationReportSource } from './ports.js';
import { FixedClock, SequentialIdGenerator } from '../../../kernel/index.js';
import type { ExecutionContext } from '../../../kernel/index.js';

function fakeContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    organizationId: 'org-test',
    stationId: 'st-1',
    actorId: 'user-owner',
    role: 'Owner',
    clock: new FixedClock(new Date('2026-03-10T06:00:00.000Z')),
    ids: new SequentialIdGenerator('id'),
    ...overrides,
  } as ExecutionContext;
}

const GEN = '2026-03-10T06:00:00.000Z';

describe('Decantation Report Composition (ticket #473)', () => {
  const baseQuery = {
    organizationId: 'org-1',
    stationId: 'st-1',
    from: '2026-03-01',
    to: '2026-03-10',
  };

  it('composes a measured visit with linked purchase, density deviation, variance and chamber summary', () => {
    const source: DecantationReportSource = {
      stationName: 'North Station',
      decantations: [
        {
          id: 'dec-1',
          businessDayId: 'bd-1',
          businessDate: '2026-03-05',
          documentNumber: 'DEC-2026-001',
          tankerNumber: 'KA-01-AB-1234',
          driverName: 'Ramesh Kumar',
          unloadStartedAt: '2026-03-05T08:00:00Z',
          unloadEndedAt: '2026-03-05T09:30:00Z',
          chambersChecked: true,
          status: 'MEASURED',
          flags: [{ code: 'CHAMBER_SHORT', chamberNo: 1, message: 'Chamber 1 dipped short' }],
          notes: 'Driver noted slight dip difference at terminal',
          createdAt: '2026-03-05T08:00:00Z',
        },
      ],
      tankLines: [
        {
          id: 'line-1',
          decantationId: 'dec-1',
          tankId: 'tank-1',
          tankName: 'Tank 1 (MS)',
          productId: 'prod-ms',
          productName: 'Motor Spirit',
          productCode: 'MS',
          beforeDip: 1200,
          beforeDipAt: '2026-03-05T08:05:00Z',
          observedDensity: 745.2,
          observedTempC: 28.5,
          roDensity: 752.4,
          afterDip: 11150,
          afterDipAt: '2026-03-05T09:35:00Z',
          salesDuring: 50,
          receivedQty: 10000,
          measuredBy: 'AFTER_DIP',
          measurementRefId: null,
          measuredAt: '2026-03-05T09:35:00Z',
          status: 'MEASURED',
          createdAt: '2026-03-05T08:00:00Z',
        },
      ],
      chambers: [
        {
          id: 'ch-1',
          decantationId: 'dec-1',
          tankLineId: 'line-1',
          chamberNo: 1,
          capacityL: 4000,
          sealOk: false, // broken seal
          mark: 'SHORT', // transit shortage
          dipMm: 980,
          emptied: true,
        },
        {
          id: 'ch-2',
          decantationId: 'dec-1',
          tankLineId: 'line-1',
          chamberNo: 2,
          capacityL: 4000,
          sealOk: true,
          mark: 'OK',
          dipMm: 1000,
          emptied: true,
        },
        {
          id: 'ch-3',
          decantationId: 'dec-1',
          tankLineId: 'line-1',
          chamberNo: 3,
          capacityL: 2000,
          sealOk: true,
          mark: 'OK',
          dipMm: 500,
          emptied: false, // not emptied
        },
      ],
      links: [
        {
          id: 'link-1',
          decantationId: 'dec-1',
          purchaseId: 'purch-1',
          productId: 'prod-ms',
          receivedQty: 10000,
          invoiceQty: 10050,
          varianceQty: -50,
          varianceComputedAt: '2026-03-05T09:36:00Z',
          invoiceNumber: 'INV-IOCL-9981',
          purchaseDocumentNumber: 'PUR-001',
          invoiceDensity: 751.8,
          supplierName: 'IOCL',
          linkedVisitCount: 1,
        },
      ],
    };

    const report = composeDecantationReport(source, baseQuery, GEN);

    expect(report.stationName).toBe('North Station');
    expect(report.visits).toHaveLength(1);

    const visit = report.visits[0];
    expect(visit.documentNumber).toBe('DEC-2026-001');
    expect(visit.tankerNumber).toBe('KA-01-AB-1234');
    expect(visit.driverName).toBe('Ramesh Kumar');
    expect(visit.status).toBe('MEASURED');
    expect(visit.flags).toHaveLength(1);

    // Chamber summary (transit loss indicators)
    expect(visit.chamberSummary.totalChambers).toBe(3);
    expect(visit.chamberSummary.shortCount).toBe(1);
    expect(visit.chamberSummary.excessCount).toBe(0);
    expect(visit.chamberSummary.notEmptiedCount).toBe(1);
    expect(visit.chamberSummary.sealsBrokenCount).toBe(1);
    expect(visit.chamberSummary.hasTransitDiscrepancy).toBe(true);

    // Tank line details
    expect(visit.tankLines).toHaveLength(1);
    const line = visit.tankLines[0];
    expect(line.tankName).toBe('Tank 1 (MS)');
    expect(line.productName).toBe('Motor Spirit');
    expect(line.beforeDip).toBe(1200);
    expect(line.afterDip).toBe(11150);
    expect(line.receivedQty).toBe(10000);
    expect(line.roDensity).toBe(752.4);
    expect(line.invoiceDensity).toBe(751.8);
    // 752.4 - 751.8 = 0.60
    expect(line.densityDeviation).toBe(0.6);

    // Linked invoice variance
    expect(visit.invoiceLinks).toHaveLength(1);
    const inv = visit.invoiceLinks[0];
    expect(inv.invoiceNumber).toBe('INV-IOCL-9981');
    expect(inv.invoiceQty).toBe(10050);
    expect(inv.receivedQty).toBe(10000);
    expect(inv.varianceQty).toBe(-50);
    expect(inv.status).toBe('LINKED');
    expect(inv.statusLabel).toBe('Short');
    expect(inv.varianceType).toBe('SHORT');

    // Totals per product
    expect(report.productTotals).toHaveLength(1);
    const msTotal = report.productTotals[0];
    expect(msTotal.productCode).toBe('MS');
    expect(msTotal.totalReceivedQty).toBe(10000);
    expect(msTotal.totalInvoiceQty).toBe(10050);
    expect(msTotal.totalVarianceQty).toBe(-50);
    expect(msTotal.shortVarianceQty).toBe(50);
    expect(msTotal.excessVarianceQty).toBe(0);
    expect(msTotal.visitCount).toBe(1);
    expect(msTotal.measuredLineCount).toBe(1);
    expect(msTotal.pendingLineCount).toBe(0);

    // Overall KPI totals
    expect(report.totals.totalVisits).toBe(1);
    expect(report.totals.measuredVisits).toBe(1);
    expect(report.totals.pendingVisits).toBe(0);
    expect(report.totals.flaggedVisits).toBe(1);
    expect(report.totals.totalChambersShort).toBe(1);
    expect(report.totals.totalChambersNotEmptied).toBe(1);
    expect(report.totals.totalSealsBroken).toBe(1);
  });

  it('handles pending measurement visit correctly', () => {
    const source: DecantationReportSource = {
      decantations: [
        {
          id: 'dec-pending',
          businessDayId: 'bd-1',
          businessDate: '2026-03-06',
          documentNumber: 'DEC-2026-002',
          tankerNumber: 'MH-12-CD-5678',
          driverName: null,
          unloadStartedAt: '2026-03-06T10:00:00Z',
          unloadEndedAt: null,
          chambersChecked: true,
          status: 'PENDING_MEASUREMENT',
          flags: [],
          notes: null,
          createdAt: '2026-03-06T10:00:00Z',
        },
      ],
      tankLines: [
        {
          id: 'line-pending',
          decantationId: 'dec-pending',
          tankId: 'tank-2',
          tankName: 'Tank 2 (HSD)',
          productId: 'prod-hsd',
          productName: 'High Speed Diesel',
          productCode: 'HSD',
          beforeDip: 5000,
          beforeDipAt: '2026-03-06T10:05:00Z',
          observedDensity: null,
          observedTempC: null,
          roDensity: null,
          afterDip: null,
          afterDipAt: null,
          salesDuring: 0,
          receivedQty: null,
          measuredBy: null,
          measurementRefId: null,
          measuredAt: null,
          status: 'PENDING_MEASUREMENT',
          createdAt: '2026-03-06T10:00:00Z',
        },
      ],
      chambers: [],
      links: [
        {
          id: 'link-pending',
          decantationId: 'dec-pending',
          purchaseId: 'purch-2',
          productId: 'prod-hsd',
          receivedQty: null,
          invoiceQty: 12000,
          varianceQty: null,
          varianceComputedAt: null,
          invoiceNumber: 'INV-HPCL-1234',
          purchaseDocumentNumber: 'PUR-002',
          invoiceDensity: 830.0,
          supplierName: 'HPCL',
          linkedVisitCount: 1,
        },
      ],
    };

    const report = composeDecantationReport(source, baseQuery, GEN);
    const visit = report.visits[0];

    expect(visit.status).toBe('PENDING_MEASUREMENT');
    expect(visit.invoiceLinks[0].status).toBe('PENDING_MEASUREMENT');
    expect(visit.invoiceLinks[0].statusLabel).toBe('Pending measurement');
    expect(visit.invoiceLinks[0].varianceQty).toBeNull();
    expect(visit.invoiceLinks[0].invoiceQty).toBe(12000);

    expect(report.totals.pendingVisits).toBe(1);
    expect(report.totals.measuredVisits).toBe(0);
    expect(report.productTotals[0].pendingLineCount).toBe(1);
  });

  it('handles unlinked decantation correctly', () => {
    const source: DecantationReportSource = {
      decantations: [
        {
          id: 'dec-unlinked',
          businessDayId: 'bd-1',
          businessDate: '2026-03-07',
          documentNumber: 'DEC-2026-003',
          tankerNumber: 'TN-09-EF-9999',
          driverName: 'Suresh',
          unloadStartedAt: '2026-03-07T12:00:00Z',
          unloadEndedAt: '2026-03-07T13:00:00Z',
          chambersChecked: false,
          status: 'MEASURED',
          flags: [],
          notes: null,
          createdAt: '2026-03-07T12:00:00Z',
        },
      ],
      tankLines: [
        {
          id: 'line-unlinked',
          decantationId: 'dec-unlinked',
          tankId: 'tank-1',
          tankName: 'Tank 1 (MS)',
          productId: 'prod-ms',
          productName: 'Motor Spirit',
          productCode: 'MS',
          beforeDip: 1000,
          beforeDipAt: '2026-03-07T12:05:00Z',
          observedDensity: 742,
          observedTempC: 29,
          roDensity: 750,
          afterDip: 6000,
          afterDipAt: '2026-03-07T13:10:00Z',
          salesDuring: 0,
          receivedQty: 5000,
          measuredBy: 'AFTER_DIP',
          measurementRefId: null,
          measuredAt: '2026-03-07T13:10:00Z',
          status: 'MEASURED',
          createdAt: '2026-03-07T12:00:00Z',
        },
      ],
      chambers: [],
      links: [], // No purchase linked!
    };

    const report = composeDecantationReport(source, baseQuery, GEN);
    const visit = report.visits[0];

    expect(visit.invoiceLinks[0].status).toBe('NOT_LINKED');
    expect(visit.invoiceLinks[0].statusLabel).toBe('Purchase not linked');
    expect(visit.invoiceLinks[0].invoiceNumber).toBeNull();
    expect(visit.invoiceLinks[0].varianceQty).toBeNull();
    expect(visit.invoiceLinks[0].receivedQty).toBe(5000);
    expect(visit.tankLines[0].invoiceDensity).toBeNull();
    expect(visit.tankLines[0].densityDeviation).toBeNull();
  });
});

describe('GetDecantationReport UseCase', () => {
  it('validates from/to dates and calls reader', async () => {
    let queryPassed: any = null;
    const mockReader: DecantationReportReader = {
      async read(query) {
        queryPassed = query;
        return {
          decantations: [],
          tankLines: [],
          chambers: [],
          links: [],
        };
      },
    };

    const useCase = new GetDecantationReport({ reader: mockReader });
    const ctx = fakeContext({ organizationId: 'org-test' });

    // 1. Invalid date format
    const resBadDate = await useCase.execute(
      { stationId: 'st-1', from: 'invalid', to: '2026-03-10' },
      ctx,
    );
    expect(resBadDate.success).toBe(false);

    // 2. from > to
    const resInverted = await useCase.execute(
      { stationId: 'st-1', from: '2026-03-15', to: '2026-03-10' },
      ctx,
    );
    expect(resInverted.success).toBe(false);
    if (!resInverted.success) {
      expect(resInverted.error.message).toContain('from date must not be after to date');
    }

    // 3. Valid call
    const resOk = await useCase.execute(
      { stationId: 'st-1', from: '2026-03-01', to: '2026-03-10' },
      ctx,
    );
    expect(resOk.success).toBe(true);
    expect(queryPassed).toEqual({
      organizationId: 'org-test',
      stationId: 'st-1',
      from: '2026-03-01',
      to: '2026-03-10',
    });
  });

  it('stamps generatedAt from the context clock', async () => {
    const reader: DecantationReportReader = {
      async read() {
        return { decantations: [], tankLines: [], chambers: [], links: [] };
      },
    };
    const res = await new GetDecantationReport({ reader }).execute(
      { stationId: 'st-1', from: '2026-03-01', to: '2026-03-10' },
      fakeContext(),
    );
    expect(res.success && res.data.generatedAt).toBe('2026-03-10T06:00:00.000Z');
  });
});

function splitSource(opts: { settled: boolean }): DecantationReportSource {
  const settledAt = opts.settled ? '2026-03-06T12:00:00Z' : null;
  const mk = (n: number, qty: number) => ({
    id: `dec-${n}`,
    businessDayId: `bd-${n}`,
    businessDate: `2026-03-0${n}`,
    documentNumber: `DEC-00${n}`,
    tankerNumber: `T-${n}`,
    driverName: null,
    unloadStartedAt: null,
    unloadEndedAt: null,
    chambersChecked: false,
    status: 'MEASURED' as const,
    flags: [],
    notes: null,
    createdAt: `2026-03-0${n}T08:00:00Z`,
    line: {
      id: `line-${n}`,
      decantationId: `dec-${n}`,
      tankId: 'tank-1',
      tankName: 'Tank 1',
      productId: 'prod-ms',
      productName: 'Motor Spirit',
      productCode: 'MS',
      beforeDip: 0,
      beforeDipAt: null,
      observedDensity: null,
      observedTempC: null,
      roDensity: null,
      afterDip: 0,
      afterDipAt: null,
      salesDuring: 0,
      receivedQty: qty,
      measuredBy: 'AFTER_DIP' as const,
      measurementRefId: null,
      measuredAt: null,
      status: 'MEASURED' as const,
      createdAt: '2026-03-05T08:00:00Z',
    },
  });
  const a = mk(5, 6000);
  const b = mk(6, 3900);
  const link = (n: number, qty: number) => ({
    id: `link-${n}`,
    decantationId: `dec-${n}`,
    purchaseId: 'purch-1',
    productId: 'prod-ms',
    receivedQty: opts.settled ? qty : null,
    invoiceQty: opts.settled ? 10000 : null,
    varianceQty: opts.settled ? -100 : null,
    varianceComputedAt: settledAt,
    invoiceNumber: 'INV-1',
    purchaseDocumentNumber: 'PUR-1',
    invoiceDensity: null,
    supplierName: 'IOCL',
    linkedVisitCount: 2,
  });
  return {
    decantations: [a, b].map(({ line: _l, ...d }) => d),
    tankLines: [a.line, b.line],
    chambers: [],
    links: [link(5, 6000), link(6, 3900)],
  };
}

describe('split invoices, settling and like-for-like totals (#473 review)', () => {
  const q = { organizationId: 'org-1', stationId: 'st-1', from: '2026-03-01', to: '2026-03-10' };

  it('counts an invoice split over two Decantations once', () => {
    const r = composeDecantationReport(splitSource({ settled: true }), q, GEN);
    expect(r.invoices).toHaveLength(1);
    const inv = r.invoices[0];
    expect(inv.invoiceQty).toBe(10000);
    expect(inv.receivedQty).toBe(9900);
    expect(inv.varianceQty).toBe(-100);
    expect(inv.visitCount).toBe(2);
    expect(inv.supplierName).toBe('IOCL');
    expect(r.totals.totalInvoiceQty).toBe(10000);
    expect(r.totals.totalVarianceQty).toBe(-100);
    expect(r.totals.totalReceivedQty).toBe(9900);
    expect(r.totals.settledReceivedQty).toBe(9900);
    expect(r.productTotals[0].totalInvoiceQty).toBe(10000);
    expect(r.productTotals[0].shortVarianceQty).toBe(100);
    for (const v of r.visits) {
      expect(v.totalInvoiceQty).toBe(10000);
      expect(v.invoiceLinks[0].linkedVisitCount).toBe(2);
    }
  });

  it('shows Settling (not Exact/0) while variance_computed_at is null', () => {
    const r = composeDecantationReport(splitSource({ settled: false }), q, GEN);
    for (const v of r.visits) {
      expect(v.invoiceLinks[0].status).toBe('SETTLING');
      expect(v.invoiceLinks[0].statusLabel).toBe('Settling');
      expect(v.invoiceLinks[0].varianceQty).toBeNull();
      expect(v.totalVarianceQty).toBeNull();
    }
    expect(r.invoices[0].status).toBe('SETTLING');
    expect(r.invoices[0].varianceQty).toBeNull();
    // like with like: nothing settled, measured litres reported as pending
    expect(r.totals.totalInvoiceQty).toBe(0);
    expect(r.totals.settledReceivedQty).toBe(0);
    expect(r.totals.pendingReceivedQty).toBe(9900);
    expect(r.totals.settlingInvoiceCount).toBe(1);
  });

  it('composes the transit total server-side next to settled variance', () => {
    const src = splitSource({ settled: true });
    src.chambers = [
      {
        id: 'c1',
        decantationId: 'dec-5',
        tankLineId: null,
        chamberNo: 1,
        capacityL: 4000,
        sealOk: false,
        mark: 'SHORT',
        dipMm: null,
        emptied: false,
      },
    ];
    const r = composeDecantationReport(src, q, GEN);
    const v = r.visits.find((x) => x.id === 'dec-5')!;
    expect(v.summary).toMatchObject({
      shortChambers: 1,
      sealsBroken: 1,
      notEmptiedChambers: 1,
      transitDiscrepancies: 3,
      settledInvoiceVarianceQty: -100,
    });
    expect(r.totals.transitDiscrepancies).toBe(3);
  });
});

describe('weightedInvoiceDensity', () => {
  it('weights by quantity, ignoring null densities', () => {
    expect(
      weightedInvoiceDensity([
        { quantity: 1000, invoiceDensity: 740 },
        { quantity: 3000, invoiceDensity: 760 },
        { quantity: 500, invoiceDensity: null },
      ]),
    ).toBe(755);
  });
  it('returns the single non-null density, or null', () => {
    expect(
      weightedInvoiceDensity([
        { quantity: 10, invoiceDensity: null },
        { quantity: 20, invoiceDensity: 748.5 },
      ]),
    ).toBe(748.5);
    expect(weightedInvoiceDensity([{ quantity: 10, invoiceDensity: null }])).toBeNull();
  });
});

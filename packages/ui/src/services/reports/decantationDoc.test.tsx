import { beforeAll, describe, expect, it } from 'vite-plus/test';
import React from 'react';
import path from 'node:path';
import { Font, pdf } from '@react-pdf/renderer';
import type { DecantationReport, DecantationReportVisit } from '@pump/shared';
import { DecantationReportDoc, decantationVisitTable } from './decantationDoc.js';
import { decantationFileName } from './decantationPdf.js';

const visit = (over: Partial<DecantationReportVisit>): DecantationReportVisit => ({
  id: 'v',
  date: '2026-03-05',
  documentNumber: 'DEC-1',
  tankerNumber: 'KA-01-AA-1111',
  driverName: null,
  unloadStartedAt: null,
  unloadEndedAt: null,
  status: 'MEASURED',
  flags: [],
  notes: null,
  chamberSummary: {
    totalChambers: 0,
    shortCount: 0,
    excessCount: 0,
    notEmptiedCount: 0,
    sealsBrokenCount: 0,
    hasTransitDiscrepancy: false,
  },
  chambers: [],
  tankLines: [],
  invoiceLinks: [],
  summary: {
    shortChambers: 0,
    excessChambers: 0,
    notEmptiedChambers: 0,
    sealsBroken: 0,
    transitDiscrepancies: 0,
    settledInvoiceVarianceQty: null,
    settlingInvoiceCount: 0,
  },
  totalReceivedQty: 0,
  totalInvoiceQty: 0,
  totalVarianceQty: null,
  ...over,
});

const link = {
  productId: 'ms',
  productName: 'Motor Spirit',
  productCode: 'MS',
  purchaseId: 'p1',
  invoiceNumber: 'INV-1',
  purchaseDocumentNumber: null,
  invoiceQty: 8150,
  receivedQty: 8100,
  varianceQty: -50,
  linkedVisitCount: 1,
  status: 'LINKED' as const,
  statusLabel: 'Short',
  varianceType: 'SHORT' as const,
};

const line = {
  id: 'l1',
  tankId: 't1',
  tankName: 'Tank 1',
  productId: 'ms',
  productName: 'Motor Spirit',
  productCode: 'MS',
  beforeDip: 1000,
  beforeDipAt: null,
  afterDip: 9000,
  afterDipAt: null,
  salesDuring: 0,
  receivedQty: 8100,
  measuredBy: 'AFTER_DIP' as const,
  measuredAt: null,
  status: 'MEASURED' as const,
  roDensity: null,
  invoiceDensity: null,
  densityDeviation: null,
};

const report: DecantationReport = {
  stationId: 'st-1',
  stationName: 'Highway Fuels',
  from: '2026-03-01',
  to: '2026-03-10',
  generatedAt: '2026-03-11T08:00:00.000Z',
  invoices: [],
  productTotals: [
    {
      productId: 'ms',
      productName: 'Motor Spirit',
      productCode: 'MS',
      totalReceivedQty: 8100,
      settledReceivedQty: 8100,
      totalInvoiceQty: 8150,
      totalVarianceQty: -50,
      pendingInvoiceQty: 0,
      pendingReceivedQty: 0,
      shortVarianceQty: 50,
      excessVarianceQty: 0,
      visitCount: 1,
      lineCount: 1,
      measuredLineCount: 1,
      pendingLineCount: 0,
    },
  ],
  visits: [
    visit({
      id: 'v1',
      driverName: 'Ramesh',
      tankLines: [line],
      invoiceLinks: [link],
      chambers: [
        {
          id: 'c1',
          chamberNo: 1,
          capacityL: 4000,
          dipMm: 990,
          sealOk: false,
          mark: 'SHORT',
          emptied: true,
          tankLineId: null,
          tankName: 'Tank 1',
        },
      ],
      chamberSummary: {
        totalChambers: 1,
        shortCount: 1,
        excessCount: 0,
        notEmptiedCount: 0,
        sealsBrokenCount: 1,
        hasTransitDiscrepancy: true,
      },
      summary: {
        shortChambers: 1,
        excessChambers: 0,
        notEmptiedChambers: 0,
        sealsBroken: 1,
        transitDiscrepancies: 2,
        settledInvoiceVarianceQty: -50,
        settlingInvoiceCount: 0,
      },
      totalReceivedQty: 8100,
      totalInvoiceQty: 8150,
      totalVarianceQty: -50,
    }),
    visit({
      id: 'v2',
      date: '2026-03-06',
      documentNumber: 'DEC-2',
      tankerNumber: 'KA-01-BB-2222',
      status: 'PENDING_MEASUREMENT',
      invoiceLinks: [
        {
          ...link,
          purchaseId: 'p2',
          receivedQty: null,
          varianceQty: null,
          varianceType: null,
          status: 'PENDING_MEASUREMENT',
          statusLabel: 'Pending measurement',
        },
      ],
    }),
  ],
  totals: {
    totalVisits: 2,
    measuredVisits: 1,
    pendingVisits: 1,
    flaggedVisits: 0,
    totalReceivedQty: 8100,
    settledReceivedQty: 8100,
    totalInvoiceQty: 8150,
    totalVarianceQty: -50,
    pendingInvoiceQty: 8150,
    pendingReceivedQty: 0,
    settlingInvoiceCount: 0,
    transitDiscrepancies: 2,
    totalChambersShort: 1,
    totalChambersExcess: 0,
    totalChambersNotEmptied: 0,
    totalSealsBroken: 1,
  },
};

describe('Decantation report PDF', () => {
  it('prints one row per visit: date, tanker, product, invoice vs received, variance, transit', () => {
    const { rows, total } = decantationVisitTable(report);
    expect(rows.map((r) => r.map((c) => c.text))).toEqual([
      [
        '5 Mar 2026',
        'KA-01-AA-1111',
        'MS',
        '8,150.00 L',
        '8,100.00 L',
        '−50.00 L',
        '1 short · 1 seal broken',
      ],
      ['6 Mar 2026', 'KA-01-BB-2222', '—', '—', '0.00 L', 'Pending measurement', '—'],
    ]);
    expect(rows[0][1].detail).toBe('DEC-1 · Ramesh');
    // The total is the server's: an invoice split across visits counts once.
    expect(total.map((c) => c.text)).toEqual([
      'Total',
      '2 visits',
      '',
      '8,150.00 L',
      '8,100.00 L',
      '−50.00 L',
      '2 discrepancies',
    ]);
  });

  it('names the file after the period', () => {
    expect(decantationFileName(report)).toBe('Decantation_Report_2026-03-01_2026-03-10');
  });

  describe('renders', () => {
    beforeAll(() => {
      // Node reads fonts from disk, not over HTTP (see reportsPdf.test.tsx).
      Font.clear();
      const fontsDir = path.resolve(__dirname, '../../../../../apps/desktop/public/fonts');
      Font.register({
        family: 'Plus Jakarta Sans',
        fonts: [
          { src: path.join(fontsDir, 'PlusJakartaSans-Regular.ttf') },
          { src: path.join(fontsDir, 'PlusJakartaSans-Bold.ttf'), fontWeight: 700 },
        ],
      });
      Font.register({
        family: 'Geist Mono',
        fonts: [
          { src: path.join(fontsDir, 'GeistMono-Regular.ttf') },
          { src: path.join(fontsDir, 'GeistMono-Medium.ttf'), fontWeight: 700 },
        ],
      });
    });

    it('to a PDF', async () => {
      const doc = React.createElement(DecantationReportDoc, {
        report,
        stationName: 'Highway Fuels',
      });
      const stream = await pdf(doc as any).toBuffer();
      const chunks: Buffer[] = [];
      for await (const chunk of stream as any) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }, 20_000);
  });
});

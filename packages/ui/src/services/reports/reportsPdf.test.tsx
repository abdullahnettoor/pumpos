import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import path from 'node:path';
import { Font, pdf } from '@react-pdf/renderer';
import { ShiftSummaryDoc, LetterheadBand, C } from './shiftSummaryDoc.js';
import { DssrDoc } from './dssrDoc.js';
import { InvoiceDoc } from './invoiceDoc.js';
import { LedgerDoc } from './ledgerDoc.js';
import { MARK_PATH, MARK_VIEWBOX } from '../../pump-ds/brand/Brand.js';

async function streamToBuffer(stream: any): Promise<Buffer> {
  if (Buffer.isBuffer(stream)) return stream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('Reports PDF with PumpOS Mark in Letterhead', () => {
  beforeAll(() => {
    // Clear top-level font registrations that used web-relative paths (/fonts/...)
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

  const dummyLogo =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const mockLetterhead = {
    legalName: 'Apex Fuel Station Pvt Ltd',
    gstin: '29ABCDE1234F1Z5',
    roCode: 'RO-998877',
    fuelBrand: 'IndianOil',
    addressLine: '123 Highway bypass',
    pincode: '560001',
    contact: '+91 98765 43210',
    logoDataUrl: dummyLogo,
  };

  it('LetterheadBand includes the vector mark and uses brand primary color', () => {
    const element = React.createElement(LetterheadBand, {
      title: 'TEST REPORT',
      stationName: 'Station One',
      letterhead: mockLetterhead,
      showLogo: true,
    });

    // Inspect the React tree
    expect(element).toBeDefined();
    const rendered = (element.type as any)(element.props);
    expect(rendered).toBeDefined();

    // Check letterhead band properties
    const band = rendered.props.children[0];
    const row = band.props.children;
    const [leftBox, rightLogo] = row.props.children;

    // Left box contains markTile and titles
    const [markTile, textGroup] = leftBox.props.children;
    expect(markTile.props.style.backgroundColor).toBe(C.white);

    const svg = markTile.props.children;
    expect(svg.props.viewBox).toBe(MARK_VIEWBOX);
    expect(svg.props.width).toBe(18);
    expect(svg.props.height).toBe(20);

    const pathEl = svg.props.children;
    expect(pathEl.props.d).toBe(MARK_PATH);
    expect(pathEl.props.fill).toBe(C.green);
    expect(pathEl.props.fillRule).toBe('evenodd');

    // Right side has station logo
    expect(rightLogo).not.toBeNull();
    expect(rightLogo.props.src).toBe(dummyLogo);
  });

  it('LetterheadBand hides station logo when showLogo is false but keeps mark', () => {
    const element = React.createElement(LetterheadBand, {
      title: 'TEST REPORT',
      stationName: 'Station One',
      letterhead: mockLetterhead,
      showLogo: false,
    });

    const rendered = (element.type as any)(element.props);
    const band = rendered.props.children[0];
    const row = band.props.children;
    const [leftBox, rightLogo] = row.props.children;

    // Mark remains present
    const [markTile] = leftBox.props.children;
    const svg = markTile.props.children;
    expect(svg.props.viewBox).toBe(MARK_VIEWBOX);
    expect(svg.props.children.props.fill).toBe(C.green);

    // Station logo is omitted
    expect(rightLogo).toBeNull();
  });

  it('LetterheadBand renders gracefully when no letterhead is configured', () => {
    const element = React.createElement(LetterheadBand, {
      title: 'EMPTY REPORT',
    });

    const rendered = (element.type as any)(element.props);
    const band = rendered.props.children[0];
    const row = band.props.children;
    const [leftBox, rightLogo] = row.props.children;

    // Mark still rendered
    const [markTile, textGroup] = leftBox.props.children;
    expect(markTile.props.children.props.viewBox).toBe(MARK_VIEWBOX);

    // Heading falls back to "PumpOS"
    const headingText = textGroup.props.children[0];
    expect(headingText.props.children).toBe('PumpOS');

    // No logo
    expect(rightLogo).toBeNull();
  });

  it('generates real PDF buffer for Shift Summary Report with mark', async () => {
    const snapshot = {
      shiftId: 'shift-12345678',
      openedAt: new Date().toISOString(),
      closedAt: new Date().toISOString(),
      generatedAt: new Date().toISOString(),
      fuelByProduct: [],
      nozzleReadings: [],
      handovers: [],
    };
    const config = {
      sections: ['header', 'meta'] as any[],
      paper: 'A4' as const,
      letterhead: mockLetterhead,
      showLogo: true,
    };

    const doc = React.createElement(ShiftSummaryDoc, { snapshot, config });
    const stream = await pdf(doc as any).toBuffer();
    const buffer = await streamToBuffer(stream);
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(100);
    // Standard PDF header magic bytes %PDF-
    const header = buffer.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  });

  it('generates real PDF buffer for DSSR Report with mark and showLogo=false', async () => {
    const dssr = {
      businessDate: '2026-09-18',
      generatedAt: new Date().toISOString(),
      fuel: {},
      payments: {},
    };
    const config = {
      sections: ['header', 'meta'] as any[],
      paper: 'A4' as const,
      letterhead: mockLetterhead,
      showLogo: false,
    };

    const doc = React.createElement(DssrDoc, { dssr, config });
    const stream = await pdf(doc as any).toBuffer();
    const buffer = await streamToBuffer(stream);
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('generates real PDF buffer for Tax Invoice with mark', async () => {
    const invoice = {
      invoiceNumber: 'INV-2026-001',
      issuedDate: '2026-09-18',
      buyerName: 'Acme Logistics Ltd',
      buyerGstin: '29AAACA0000A1Z5',
      buyerStateCode: '29',
      interState: false,
      totalAmount: 5000,
      snapshotData: {
        lines: [
          {
            name: 'Diesel (HSD)',
            hsnCode: '2710',
            quantity: 50,
            unitPrice: 90,
            taxableAmount: 4500,
            vatRate: 20,
            cgst: 0,
            sgst: 0,
            igst: 0,
            vat: 900,
            cess: 0,
            taxCategory: 'FUEL_VAT',
            lineTotal: 5400,
          },
        ],
        interState: false,
        supplierGstin: '29ABCDE1234F1Z5',
        supplierStateCode: '29',
        placeOfSupply: '29',
      },
    };

    const doc = React.createElement(InvoiceDoc, {
      invoice: invoice as any,
      stationName: 'Apex Station',
      letterhead: mockLetterhead,
      showLogo: true,
    });
    const stream = await pdf(doc as any).toBuffer();
    const buffer = await streamToBuffer(stream);
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('generates real PDF buffer for Ledger Report with mark', async () => {
    const doc = React.createElement(LedgerDoc, {
      title: 'CUSTOMER LEDGER',
      entityName: 'Acme Transport',
      periodLabel: '01 Sep 2026 — 18 Sep 2026',
      debitLabel: 'Debits',
      creditLabel: 'Credits',
      balanceLabel: 'Closing Balance',
      rows: [
        {
          dateLabel: '2026-09-01',
          particulars: 'Fuel purchase',
          debit: 12000,
          credit: 0,
          balance: 12000,
        },
      ],
      totals: { debit: 12000, credit: 0, balance: 12000 },
      stationName: 'Apex Station',
      letterhead: mockLetterhead,
      showLogo: true,
    });
    const stream = await pdf(doc as any).toBuffer();
    const buffer = await streamToBuffer(stream);
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});

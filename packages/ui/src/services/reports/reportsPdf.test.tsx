import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
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

/**
 * Extracts and decompresses all PDF content streams from a compiled PDF binary buffer.
 */
function extractDecompressedStreams(pdfBuffer: Buffer): string[] {
  const raw = pdfBuffer.toString('latin1');
  const matches = raw.matchAll(/stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g);
  const streams: string[] = [];
  for (const m of matches) {
    try {
      const decomp = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('utf8');
      streams.push(decomp);
    } catch {
      // Stream is uncompressed or raw binary
      streams.push(m[1]);
    }
  }
  return streams;
}

/**
 * Asserts that the compiled PDF binary contains the vector PumpOS mark.
 * The canonical mark is drawn with fillRule="evenodd" (which maps to the PDF
 * 'f*' operator) and contains numerous cubic bezier curves ('c' operator)
 * rendering the pump nozzle knockout inside the lettermark.
 */
function assertPdfContainsVectorMark(pdfBuffer: Buffer) {
  const streams = extractDecompressedStreams(pdfBuffer);
  // Find page drawing streams (containing coordinate transforms 'cm' and path fills)
  const pageStream = streams.find((s) => s.includes('cm') && s.includes('f*'));
  expect(
    pageStream,
    'Generated PDF stream must contain even-odd vector fill operator (f*) for the mark',
  ).toBeDefined();

  const curves = pageStream!.match(/ c[\r\n]/g) || [];
  expect(
    curves.length,
    'Generated PDF stream must contain cubic bezier curves for the mark artwork',
  ).toBeGreaterThan(20);
}

describe('Reports PDF with PumpOS Mark in Letterhead', () => {
  beforeAll(() => {
    /*
     * Font Registration Environment Diagnosis:
     * In web browser and Tauri webview runtime, TTF files are fetched over HTTP from /fonts/...
     * In Node.js environments (vitest, CLI generators, SSR), @react-pdf/renderer's font loader
     * treats paths not beginning with http(s):// as absolute filesystem paths (/fonts/...)
     * which causes ENOENT: no such file or directory, open '/fonts/PlusJakartaSans-Regular.ttf'.
     * Clearing the top-level relative registrations and registering resolved local filesystem
     * paths allows real PDF buffers to compile cleanly in Node.
     */
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
    showLogo: true,
  };

  it('LetterheadBand renders vector mark in white directly on brand-green band with exact aspect ratio', () => {
    const element = React.createElement(LetterheadBand, {
      title: 'TEST REPORT',
      stationName: 'Station One',
      letterhead: mockLetterhead,
      showLogo: true,
    });

    expect(element).toBeDefined();
    const rendered = (element.type as any)(element.props);
    expect(rendered).toBeDefined();

    const band = rendered.props.children[0];
    const row = band.props.children;
    const [leftBox, rightLogo] = row.props.children;

    // Left box contains vector Svg mark and titles
    const [svg, textGroup] = leftBox.props.children;
    expect(svg.props.viewBox).toBe(MARK_VIEWBOX);
    // Aspect ratio 21.3 / 24 = 0.8875 closely matches MARK_VIEWBOX 676.7 / 762.3 = 0.8877
    expect(svg.props.width).toBe(21.3);
    expect(svg.props.height).toBe(24);

    const pathEl = svg.props.children;
    expect(pathEl.props.d).toBe(MARK_PATH);
    // Directly respects currentColor / white on brand-colored surface contract
    expect(pathEl.props.fill).toBe(C.white);
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
    const [svg] = leftBox.props.children;
    expect(svg.props.viewBox).toBe(MARK_VIEWBOX);
    expect(svg.props.children.props.fill).toBe(C.white);

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
    const [svg, textGroup] = leftBox.props.children;
    expect(svg.props.viewBox).toBe(MARK_VIEWBOX);

    // Heading falls back to "PumpOS"
    const headingText = textGroup.props.children[0];
    expect(headingText.props.children).toBe('PumpOS');

    // No logo
    expect(rightLogo).toBeNull();
  });

  it('generates real PDF buffer for Shift Summary Report with verified vector mark in PDF stream', async () => {
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
    };

    const doc = React.createElement(ShiftSummaryDoc, { snapshot, config });
    const stream = await pdf(doc as any).toBuffer();
    const buffer = await streamToBuffer(stream);
    expect(buffer).toBeDefined();
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    // Deep verification: inspect decompressed PDF page stream
    assertPdfContainsVectorMark(buffer);
  });

  it('generates real PDF buffer for DSSR Report with verified vector mark and showLogo=false', async () => {
    const dssr = {
      businessDate: '2026-09-18',
      generatedAt: new Date().toISOString(),
      fuel: {},
      payments: {},
    };
    const config = {
      sections: ['header', 'meta'] as any[],
      paper: 'A4' as const,
      letterhead: { ...mockLetterhead, showLogo: false },
    };

    const doc = React.createElement(DssrDoc, { dssr, config });
    const stream = await pdf(doc as any).toBuffer();
    const buffer = await streamToBuffer(stream);
    expect(buffer).toBeDefined();
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    assertPdfContainsVectorMark(buffer);
  });

  it('generates real PDF buffer for Tax Invoice with verified vector mark in PDF stream', async () => {
    const invoice = {
      invoiceNumber: 'INV-2026-001',
      issuedDate: '2026-09-18',
      buyerName: 'Acme Logistics Ltd',
      buyerGstin: '29AAACA0000A1Z5',
      buyerStateCode: '29',
      interState: false,
      taxableAmount: 4500,
      cgstTotal: 0,
      sgstTotal: 0,
      igstTotal: 0,
      vatTotal: 900,
      cessTotal: 0,
      roundOff: 0,
      totalAmount: 5400,
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
    });
    const stream = await pdf(doc as any).toBuffer();
    const buffer = await streamToBuffer(stream);
    expect(buffer).toBeDefined();
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    assertPdfContainsVectorMark(buffer);
  });

  it('generates real PDF buffer for Ledger Report with verified vector mark in PDF stream', async () => {
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
    });
    const stream = await pdf(doc as any).toBuffer();
    const buffer = await streamToBuffer(stream);
    expect(buffer).toBeDefined();
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    assertPdfContainsVectorMark(buffer);
  });
});

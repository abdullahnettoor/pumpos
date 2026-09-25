import { describe, it, expect, beforeAll } from 'vitest';
import React from 'react';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Font, pdf, Text } from '@react-pdf/renderer';
import { ShiftSummaryDoc, LetterheadBand, C } from './shiftSummaryDoc.js';
import { DssrDoc } from './dssrDoc.js';
import { InvoiceDoc } from './invoiceDoc.js';
import { LedgerDoc } from './ledgerDoc.js';
import { AttendantReportDoc, dayPageTitle } from './attendantReportDoc.js';
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

  // #308: an older snapshot that stored purchases keeps its "Supplier Fuel
  // Intakes" section; a new snapshot (no purchases) renders none.
  it('renders stored purchases from an older Shift Summary snapshot only', () => {
    const texts = (node: any): string[] => {
      if (node == null || typeof node === 'boolean') return [];
      if (typeof node === 'string' || typeof node === 'number') return [String(node)];
      if (Array.isArray(node)) return node.flatMap(texts);
      if (typeof node.type === 'function' && node.type !== Text) {
        return texts((node.type as any)(node.props));
      }
      return texts(node.props?.children);
    };
    const config = { sections: ['meta', 'signatures'] as any[], paper: 'A4' as const };
    const base = { shiftId: 'shift-1', nozzleReadings: [], handovers: [] };
    const old = {
      ...base,
      purchases: [{ supplierName: 'IOCL Depot', documentNumber: 'PUR-7', amount: 450000 }],
    };
    const oldText = texts((ShiftSummaryDoc as any)({ snapshot: old, config })).join(' ');
    expect(oldText).toContain('SUPPLIER FUEL INTAKES');
    expect(oldText).toContain('IOCL Depot');
    const newText = texts((ShiftSummaryDoc as any)({ snapshot: base, config })).join(' ');
    expect(newText).not.toContain('SUPPLIER FUEL INTAKES');
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

  /**
   * #221: a statement covering several business days is read a day at a time,
   * so it paginates — a cover carrying the range's collective figures, then
   * one page per day. A single-day statement is one document and gains no
   * cover from the same code path.
   */
  describe('attendant statement pagination', () => {
    const attendantShift = (businessDate: string, over: Record<string, unknown> = {}) => ({
      shiftId: `sh-${businessDate}`,
      businessDate,
      shiftTemplateName: 'Morning',
      closedAt: `${businessDate}T14:00:00.000Z`,
      dispensers: [],
      cashHandedOver: 1000,
      cardHandedOver: 200,
      upiHandedOver: 300,
      creditHandedOver: 100,
      expectedFuelSales: 1650,
      billedSales: 0,
      handoverProductSales: 0,
      creditSales: 800,
      creditSaleLines: [
        {
          transactionId: `ct-${businessDate}`,
          customerId: 'cust-1',
          customerName: 'Kerala Roadways',
          vehicleRegistration: 'KL-07-AB-1234',
          productName: 'Diesel',
          quantity: 20,
          unitPrice: 40,
          amount: 800,
        },
      ],
      varianceAmount: -50,
      testingVolume: 5,
      ...over,
    });

    const statement = (dates: string[]) => ({
      attendantId: 'att-1',
      attendantName: 'Ravi',
      shiftsWorked: dates.length,
      handoverCount: dates.length,
      totals: {
        cashHandedOver: 1000 * dates.length,
        cardHandedOver: 200 * dates.length,
        upiHandedOver: 300 * dates.length,
        creditHandedOver: 100 * dates.length,
        expectedFuelSales: 1650 * dates.length,
        billedSales: 0,
        handoverProductSales: 0,
        creditSales: 800 * dates.length,
        varianceAmount: -50 * dates.length,
      },
      shifts: dates.map((d) => attendantShift(d)),
      from: dates[0],
      to: dates[dates.length - 1],
      generatedAt: '2026-03-04T06:00:00.000Z',
    });

    const config = {
      sections: [
        'header',
        'summary',
        'fuelSales',
        'merchandise',
        'creditSales',
        'terminals',
        'variance',
        'signature',
      ] as any[],
      paper: 'A4' as const,
      letterhead: mockLetterhead,
    };

    const render = async (dates: string[]) => {
      const doc = React.createElement(AttendantReportDoc, {
        data: statement(dates) as any,
        config,
      });
      const stream = await pdf(doc as any).toBuffer();
      return streamToBuffer(stream);
    };

    /*
     * Counted off the raw PDF objects: @react-pdf exposes no page count, and
     * rendering to text loses it. If a future renderer writes pages into
     * object streams this stops matching — it would under-count, not silently
     * pass, so the test still fails loudly.
     */
    const pageCount = (buffer: Buffer) =>
      (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

    it('gives a single-day statement no separate cover page', async () => {
      const buffer = await render(['2026-03-01']);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(pageCount(buffer)).toBe(1);
    });

    it('covers a multi-day statement, then one page per business day', async () => {
      const buffer = await render(['2026-03-01', '2026-03-02', '2026-03-03']);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      // 1 cover + 3 day pages.
      expect(pageCount(buffer)).toBe(4);
    });

    /*
     * PDF text is font-encoded, so the name is asserted on the element tree:
     * every bold Text node's string content, walked without invoking
     * components (the letterhead is not the subject here).
     */
    const boldTexts = (node: any, out: string[] = []): string[] => {
      if (node == null || typeof node !== 'object') return out;
      if (Array.isArray(node)) {
        node.forEach((n) => boldTexts(n, out));
        return out;
      }
      const props = node.props ?? {};
      if (props.style?.fontWeight === 700) {
        const flat = ([] as any[]).concat(props.children).flat(Infinity);
        out.push(flat.filter((c) => typeof c === 'string').join(''));
      }
      boldTexts(props.children, out);
      return out;
    };

    it('titles the header and every day page with the attendant name', () => {
      const tree = (AttendantReportDoc as any)({
        data: statement(['2026-03-01', '2026-03-02']),
        config,
      });
      const headerTree = tree.props.children[0].props.children;
      const titles = boldTexts(tree);
      expect(boldTexts(headerTree)).toContain('Ravi');
      expect(titles).toContain(dayPageTitle('Ravi', '2026-03-01'));
      expect(titles).toContain('Ravi · 2026-03-02');
    });
  });
});

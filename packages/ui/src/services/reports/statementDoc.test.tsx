import { beforeAll, describe, expect, it } from 'vitest';
import React from 'react';
import path from 'node:path';
import { Font, pdf } from '@react-pdf/renderer';
import { StatementDoc, signedInr } from './statementDoc.js';
import { fileSlug, statementFileName, type StatementPdfData } from './statementPdf.js';

/**
 * Every string the document lays out, in order. Function components (the
 * letterhead, KPI tiles, rows) are expanded by calling them, so the check reads
 * the document's own tree, not the compressed PDF byte stream (#442).
 */
function textOf(node: React.ReactNode): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(textOf);
  const el = node as React.ReactElement<any>;
  if (typeof el.type === 'function') return textOf((el.type as any)(el.props));
  return textOf(el.props?.children);
}

const data = (over: Partial<StatementPdfData> = {}): StatementPdfData => ({
  kind: 'customer',
  party: { name: 'Acme Transport', lines: ['Fleet · FL-001', 'GSTIN 29ABCDE1234F1Z5'] },
  from: '2026-10-01',
  to: '2026-10-31',
  periodLabel: 'October 2026',
  openingBalance: '5000.00',
  closingBalance: '9500.00',
  totalDebits: '8500.00',
  totalCredits: '4000.00',
  rows: [
    {
      date: '7 Oct 2026',
      title: 'Credit Sale',
      detail: 'Shift 20261007-1 · 120 L Diesel · KL-11-AB-4521',
      debit: '8500.00',
      credit: null,
      balance: '13500.00',
    },
    {
      date: '18 Oct 2026',
      title: 'Payment received',
      detail: 'UPI · Ref COL-000042',
      debit: null,
      credit: '4000.00',
      balance: '9500.00',
    },
  ],
  generatedAt: '2026-10-10T08:30:00.000Z',
  ...over,
});

const render = (d: StatementPdfData) =>
  textOf(
    (StatementDoc as any)({
      data: d,
      stationName: 'Apex Station',
      letterhead: { legalName: 'Apex Fuel Station Pvt Ltd' },
    }),
  );

describe('StatementDoc content', () => {
  it('shows the station, the party, the range and every figure the server sent', () => {
    const text = render(data());
    expect(text).toContain('Apex Fuel Station Pvt Ltd');
    expect(text).toContain('CUSTOMER STATEMENT');
    expect(text).toContain('Acme Transport');
    expect(text).toContain('Fleet · FL-001');
    expect(text).toContain('GSTIN 29ABCDE1234F1Z5');
    expect(text).toContain('October 2026');
    expect(text).toContain('2026-10-01 to 2026-10-31');
    // Opening, entries (with their running balance) and closing.
    expect(text).toContain('₹5,000.00');
    expect(text).toContain('₹13,500.00');
    expect(text).toContain('₹9,500.00');
    expect(text).toContain('Credit Sale');
    expect(text).toContain('Shift 20261007-1 · 120 L Diesel · KL-11-AB-4521');
    expect(text).toContain('Payment received');
    expect(text).toContain('₹8,500.00');
    expect(text).toContain('₹4,000.00');
  });

  it('names what the closing balance means for a customer and for a supplier', () => {
    expect(render(data())).toContain('Due from customer');
    expect(render(data({ closingBalance: '-1200.00' }))).toContain('Advance held for customer');
    const supplier = render(data({ kind: 'supplier', closingBalance: '7000.00' }));
    expect(supplier).toContain('SUPPLIER STATEMENT');
    expect(supplier).toContain('Purchases');
    expect(supplier).toContain('Paid');
    expect(supplier).toContain('Payable to supplier');
    expect(render(data({ kind: 'supplier', closingBalance: '-1200.00' }))).toContain(
      'Advance paid to supplier',
    );
    expect(render(data({ closingBalance: '0.00' }))).toContain('Settled');
  });

  it('prints a negative balance with the sign in front of the rupee', () => {
    expect(signedInr('-1200')).toBe('-₹1,200.00');
    expect(signedInr('1200')).toBe('₹1,200.00');
    expect(render(data({ closingBalance: '-1200.00' }))).toContain('-₹1,200.00');
  });

  it('says so when nothing happened in the range, keeping opening = closing', () => {
    const text = render(
      data({ rows: [], totalDebits: '0.00', totalCredits: '0.00', closingBalance: '5000.00' }),
    );
    expect(text).toContain('No transactions in this period.');
    expect(text.some((t) => t.startsWith('0 entries'))).toBe(true);
  });
});

describe('statement file name', () => {
  it('is ASCII, carries the party and the range', () => {
    expect(statementFileName(data())).toBe(
      'Customer_Statement_Acme_Transport_2026-10-01_2026-10-31',
    );
    expect(
      statementFileName(data({ kind: 'supplier', party: { name: 'IOCL — Depot #4', lines: [] } })),
    ).toBe('Supplier_Statement_IOCL_Depot_4_2026-10-01_2026-10-31');
  });

  it('falls back when the name has nothing ASCII', () => {
    expect(fileSlug('गणेश', 'Customer')).toBe('Customer');
  });
});

describe('StatementDoc PDF', () => {
  beforeAll(() => {
    // Node has no `/fonts/...` URL base: point the families at the vendored TTFs.
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

  it('renders to a real PDF, across pages for a long statement', async () => {
    const rows = Array.from({ length: 90 }, (_, i) => ({
      date: `${(i % 28) + 1} Oct 2026`,
      title: 'Credit Sale',
      detail: 'Shift 20261007-1 · 50 L Diesel · KL-11-AB-4521',
      debit: '100.00',
      credit: null,
      balance: String(5100 + i * 100),
    }));
    const element = React.createElement(StatementDoc, {
      data: data({ rows }),
      stationName: 'Apex Station',
    });
    const buffer = Buffer.from(await (pdf(element as any) as any).toBuffer().then(toBytes));
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    // More than one page object: the page tree names its page count.
    const count = /\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/.exec(buffer.toString('latin1'));
    expect(Number(count?.[1])).toBeGreaterThan(1);
  }, 30_000);
});

async function toBytes(stream: any): Promise<Uint8Array> {
  if (stream instanceof Uint8Array) return stream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

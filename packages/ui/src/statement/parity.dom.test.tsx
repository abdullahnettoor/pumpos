// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RangedPartyLedger } from '@pump/shared';
import { ledgerDocTable, type LedgerDocProps } from '../services/reports/ledgerDoc.js';
import { partyLedgerStatement, partyStatementDoc } from '../services/reports/partyStatement.js';
import { buildLedgerStatement, type LedgerStatement } from './model.js';
import { moneyEntries, partyEntries } from './adapters.js';
import { statementDocProps } from './pdf.js';
import { NOT_RECONCILED_NOTE, StatementView } from './StatementView.js';

afterEach(cleanup);

/** What the screen prints, cell by cell: header, body lines, closing line. */
function screenOf(statement: LedgerStatement) {
  render(<StatementView statement={statement} label="Statement" />);
  const table = screen.getByRole('table', { name: 'Statement' });
  const cells = (tr: Element) =>
    Array.from(tr.querySelectorAll('th, td')).map((c) => c.textContent ?? '');
  return {
    header: cells(table.querySelector('thead tr')!),
    lines: Array.from(table.querySelectorAll('tbody tr')).map(cells),
    closing: cells(table.querySelector('tfoot tr')!),
  };
}

/** What a `LedgerDoc` prints, cell by cell (a cell's text then its detail line). */
function docOf(props: Parameters<typeof ledgerDocTable>[0]) {
  const t = ledgerDocTable(props);
  const cells = (row: { text: string; detail?: string }[]) =>
    row.map((c) => c.text + (c.detail ?? ''));
  return {
    header: t.cols.map((c) => c.header),
    lines: [...(t.leadRow ? [t.leadRow] : []), ...t.cellRows].map(cells),
    // The PDF prints what the closing balance means under its label; the figures are the point.
    closing: t.totalRow.map((c) => c.text),
  };
}

/** What the PDF prints for a statement. */
const pdfOf = (statement: LedgerStatement) =>
  docOf(statementDocProps(statement, 'Due from customer'));

const customer = buildLedgerStatement(
  partyEntries(
    [
      {
        id: 'a',
        transactionType: 'Credit Sale',
        amount: '8500.00',
        businessDate: '2026-10-07',
        shiftBusinessDate: '2026-10-07',
        shiftSequence: 1,
        productName: 'Diesel',
        quantity: 120,
        unit: 'L',
        vehicleRegistration: 'KL-11-AB-4521',
      },
      {
        id: 'b',
        transactionType: 'Collection',
        amount: '20000.00',
        businessDate: '2026-10-18',
        method: 'UPI',
        reference: 'COL-000042',
      },
    ],
    'customer',
  ),
  { kind: 'customer', opening: 5000 },
);

const cash = buildLedgerStatement(
  moneyEntries([
    { id: 'm1', direction: 'in', amount: 1200, sourceType: 'SALE_CASH', entryDate: '2026-10-02' },
    {
      id: 'm2',
      direction: 'out',
      amount: 300.5,
      sourceType: 'EXPENSE',
      entryDate: '2026-10-03',
      notes: 'Generator diesel',
    },
  ]),
  { kind: 'account', opening: -100 },
);

/** A supplier's ranged ledger, as the server sends it: opening, running balances, closing. */
const supplierLedger: RangedPartyLedger = {
  periodOpeningBalance: '1000.00',
  closingBalance: '-500.00',
  hasEarlier: true,
  entries: [
    {
      id: 's1',
      transactionType: 'Purchase',
      amount: '2000.00',
      businessDate: '2026-09-30',
      runningBalance: '3000.00',
      productName: 'HSD',
      invoiceNumber: 'INV-77',
      createdAt: '2026-09-30T06:00:00.000Z',
    },
    {
      id: 's2',
      transactionType: 'Payment',
      amount: '3500.00',
      businessDate: '2026-10-07',
      runningBalance: '-500.00',
      method: 'BANK',
      fundingAccountName: 'Federal Bank',
      createdAt: '2026-10-07T06:00:00.000Z',
    },
  ] as RangedPartyLedger['entries'],
};

/** The server-balance path: every row carries the server's running balance. */
const supplier = partyLedgerStatement(supplierLedger, 'supplier');

const supplierPdf = partyStatementDoc({
  kind: 'supplier',
  party: { name: 'IOCL Depot', lines: [] },
  range: { from: '2026-09-01', to: '2026-10-31' },
  periodLabel: '01 Sep 2026 — 31 Oct 2026',
  ledger: supplierLedger,
  generatedAt: new Date('2026-10-10T08:30:00.000Z'),
});

describe('a statement prints the same on screen and in the PDF', () => {
  it.each([
    ['customer', customer],
    ['cash account', cash],
    ['supplier, on the server balances', supplier],
  ])('%s: same header, lines and closing figures', (_name, statement) => {
    const screenView = screenOf(statement);
    const pdf = pdfOf(statement);
    expect(screenView.header).toEqual(pdf.header);
    expect(screenView.lines).toEqual(pdf.lines);
    expect(screenView.closing).toEqual(pdf.closing);
  });

  it('reads as an accountant expects: Debit · Credit columns, signed balance, closing line', () => {
    const { header, lines, closing } = screenOf(customer);
    expect(header).toEqual(['Date', 'Particulars', 'Debit', 'Credit', 'Balance']);
    expect(lines).toEqual([
      ['', 'Opening balance', '', '', '₹5,000.00'],
      [
        '07 Oct 2026',
        'Credit SaleShift 20261007-1 · 120 L Diesel · KL-11-AB-4521',
        '₹8,500.00',
        '',
        '₹13,500.00',
      ],
      ['18 Oct 2026', 'Payment receivedUPI · Ref COL-000042', '', '₹20,000.00', '−₹6,500.00'],
    ]);
    expect(closing).toEqual(['Closing balance', '', '₹8,500.00', '₹20,000.00', '−₹6,500.00']);
  });

  it('the party statement PDF (partyStatementDoc) prints what the screen prints', () => {
    const screenView = screenOf(supplier);
    const pdf = docOf(supplierPdf as LedgerDocProps);
    expect(screenView.header).toEqual(pdf.header);
    expect(screenView.lines).toEqual(pdf.lines);
    expect(screenView.closing).toEqual(pdf.closing);
  });

  it('a supplier statement: a purchase is a Credit, a payment a Debit, the balance what you owe', () => {
    expect(supplier.reconciled).toBe(true);
    const { lines, closing } = screenOf(supplier);
    expect(lines).toEqual([
      ['', 'Opening balance', '', '', '₹1,000.00'],
      ['30 Sep 2026', 'Purchase · HSDINV-77', '', '₹2,000.00', '₹3,000.00'],
      ['07 Oct 2026', 'Payment madeBank · From Federal Bank', '₹3,500.00', '', '−₹500.00'],
    ]);
    expect(closing).toEqual(['Closing balance', '', '₹3,500.00', '₹2,000.00', '−₹500.00']);
  });

  it("server balances that don't add up: both views print the worked-out ones, the screen says so", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const off = partyLedgerStatement({ ...supplierLedger, closingBalance: '999.00' }, 'supplier');
    warn.mockRestore();
    expect(off.reconciled).toBe(false);
    const screenView = screenOf(off);
    expect(screenView.closing.at(-1)).toBe('−₹500.00');
    expect(pdfOf(off).closing.at(-1)).toBe('−₹500.00');
    expect(screen.getByRole('note').textContent).toBe(NOT_RECONCILED_NOTE);
  });
});

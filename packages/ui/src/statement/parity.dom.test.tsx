// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ledgerDocTable } from '../services/reports/ledgerDoc.js';
import { buildStatement, type Statement } from './model.js';
import { moneyEntries, partyEntries } from './adapters.js';
import { statementDocProps } from './pdf.js';
import { StatementView } from './StatementView.js';

afterEach(cleanup);

/** What the screen prints, cell by cell: header, body lines, closing line. */
function screenOf(statement: Statement) {
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

/** What the PDF prints, cell by cell (a cell's text then its detail line). */
function pdfOf(statement: Statement) {
  const t = ledgerDocTable(statementDocProps(statement, 'Due from customer'));
  const cells = (row: { text: string; detail?: string }[]) =>
    row.map((c) => c.text + (c.detail ?? ''));
  return {
    header: t.cols.map((c) => c.header),
    lines: [...(t.leadRow ? [t.leadRow] : []), ...t.cellRows].map(cells),
    // The PDF prints what the closing balance means under its label; the figures are the point.
    closing: t.totalRow.map((c) => c.text),
  };
}

const customer = buildStatement(
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

const cash = buildStatement(
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

describe('a statement prints the same on screen and in the PDF', () => {
  it.each([
    ['customer', customer],
    ['cash account', cash],
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
});

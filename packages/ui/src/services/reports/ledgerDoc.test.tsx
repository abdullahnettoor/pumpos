import { describe, expect, it } from 'vitest';
import React from 'react';
import { LedgerDoc, signedInr, type LedgerDocProps } from './ledgerDoc.js';
import { C } from './shiftSummaryDoc.js';

/**
 * The document's own element tree with function components expanded (the
 * letterhead, KPI tiles, table), so a check reads what is laid out and how, not
 * the compressed PDF byte stream.
 */
function treeOf(node: React.ReactNode): unknown {
  if (node === null || node === undefined || typeof node === 'boolean') return null;
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return normalize(node.map(treeOf));
  const el = node as React.ReactElement<any>;
  if (typeof el.type === 'function') return treeOf((el.type as any)(el.props));
  if ((el.type as unknown) === React.Fragment) return treeOf(el.props.children);
  const { children, ...props } = el.props ?? {};
  const clean = Object.fromEntries(
    Object.entries(props)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, typeof v === 'function' ? '[fn]' : v]),
  );
  return { type: String(el.type), props: clean, children: treeOf(children) };
}

/** React renders nothing for null, false and an empty list: leave them out, and unwrap a lone child. */
function normalize(children: unknown[]): unknown {
  const flat = children.flatMap((c) => (Array.isArray(c) ? c : [c])).filter((c) => c !== null);
  return flat.length === 0 ? null : flat.length === 1 ? flat[0] : flat;
}

function textOf(node: React.ReactNode): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(textOf);
  const el = node as React.ReactElement<any>;
  if (typeof el.type === 'function') return textOf((el.type as any)(el.props));
  return textOf(el.props?.children);
}

/** The props the desktop Unified Ledger passes (UnifiedLedger.tsx `downloadPdf`). */
const desktopProps: LedgerDocProps = {
  title: 'CUSTOMER LEDGER',
  entityName: 'Acme Transport',
  periodLabel: '01 Sep 2026 — 18 Sep 2026',
  debitLabel: 'Debits',
  creditLabel: 'Credits',
  balanceLabel: 'Closing Balance',
  rows: [
    {
      dateLabel: '01 Sep 2026',
      particulars: 'Credit sale',
      debit: 12000,
      credit: 0,
      balance: 12000,
    },
    {
      dateLabel: '09 Sep 2026',
      particulars: 'Collection',
      debit: 0,
      credit: 15000,
      balance: -3000,
    },
  ],
  totals: { debit: 12000, credit: 15000, balance: -3000 },
  stationName: 'Apex Station',
  letterhead: { legalName: 'Apex Fuel Station Pvt Ltd' },
};

describe('LedgerDoc as the desktop Unified Ledger uses it', () => {
  it('lays out exactly the document it always has', () => {
    expect(treeOf((LedgerDoc as any)(desktopProps))).toMatchSnapshot();
  });

  it('lays out the empty ledger the same way too', () => {
    const empty = { ...desktopProps, rows: [], totals: { debit: 0, credit: 0, balance: 0 } };
    expect(treeOf((LedgerDoc as any)(empty))).toMatchSnapshot();
  });

  it('prints the generated line only when asked', () => {
    const line = (props: LedgerDocProps) => textOf((LedgerDoc as any)(props)).join('');
    expect(line(desktopProps)).not.toContain('\u2022 Generated');
    expect(line({ ...desktopProps, generatedAt: '2026-10-10T08:30:00Z' })).toContain(
      '\u2022 Generated',
    );
  });
});

describe('LedgerDoc as a party statement', () => {
  const statement: LedgerDocProps = {
    ...desktopProps,
    title: 'SUPPLIER STATEMENT',
    entityName: 'HPCL Depot',
    partyLines: ['GSTIN 32AAACH1118R1Z5', 'Phone 0495 1'],
    partyAccount: true,
    opening: 5000,
    closing: { note: 'Advance' },
    rows: [
      {
        dateLabel: '9 Oct 2026',
        particulars: 'Payment made',
        detail: 'Bank transfer · From HDFC Current',
        debit: 0,
        credit: 6200,
        balance: -1200,
      },
    ],
    totals: { debit: 0, credit: 6200, balance: -1200 },
  };
  const text = (props: LedgerDocProps) => textOf((LedgerDoc as any)(props));

  it('prints the party lines, the opening line, the row detail and the closing line', () => {
    const t = text(statement);
    expect(t).toContain('GSTIN 32AAACH1118R1Z5');
    expect(t).toContain('Phone 0495 1');
    expect(t).toContain('OPENING BALANCE');
    expect(t).toContain('₹5,000.00');
    expect(t).toContain('Bank transfer · From HDFC Current');
    expect(t).toContain('CLOSING BALANCE');
    expect(t).toContain('Advance');
  });

  it('prints a negative balance with the sign in front of the rupee', () => {
    expect(signedInr(-1200)).toBe('-₹1,200.00');
    expect(signedInr('1200')).toBe('₹1,200.00');
    expect(text(statement)).toContain('-₹1,200.00');
  });

  it('does not paint an advance in the danger colour; the desktop ledger still paints a shortfall', () => {
    const paintsDanger = (props: LedgerDocProps) =>
      JSON.stringify(treeOf((LedgerDoc as any)(props))).includes(`"color":"${C.danger}"`);
    expect(paintsDanger(statement)).toBe(false);
    expect(paintsDanger(desktopProps)).toBe(true);
  });

  it('says so when nothing happened in the range, keeping opening = closing', () => {
    const t = text({
      ...statement,
      rows: [],
      totals: { debit: 0, credit: 0, balance: 5000 },
      closing: { note: 'Due from customer' },
    });
    expect(t).toContain('No transactions in this period.');
    expect(t).toContain('OPENING BALANCE');
    expect(t).toContain('CLOSING BALANCE');
  });
});

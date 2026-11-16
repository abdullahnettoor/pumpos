import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import {
  C,
  KpiStrip,
  PTable,
  ProposalDoc,
  SectionTitle,
  amt,
  dShort,
  rs0,
  s,
  sum,
  type PCol,
  type PRow,
  type ProposalContext,
} from './shared.js';

export type LedgerKind = 'Account' | 'Customer' | 'Supplier' | 'Expense head' | 'Income head';

/** One posting on the ledger, in the section's two columns. */
export interface LedgerReportRow {
  date: string;
  /** Group B for expenses, income and supplier payments. */
  voucherNo: string;
  particulars: string;
  /** A second, lighter line: vehicle and shift, Funding account, invoice. */
  detail?: string;
  debit: number | null;
  credit: number | null;
}

/** One ledger: a money account, a party, or an expense / income head. */
export interface LedgerSection {
  kind: LedgerKind;
  name: string;
  /** What the ledger is ("Financial Account · BANK"). */
  descriptor: string;
  period: string;
  /**
   * Column words. Money accounts read In / Out like the Cash Book; parties
   * read Debit / Credit like the app's statements. `credit: null` drops the
   * column (an expense head only accumulates).
   */
  columns: { debit: string; credit: string | null; balance: string };
  /** The column that raises the balance: `debit` (accounts, customers, heads) or `credit` (suppliers). */
  raisedBy: 'debit' | 'credit';
  /** One line saying what raises and what lowers the balance. */
  caption: string;
  openingLabel: string;
  opening: number;
  rows: LedgerReportRow[];
}

export interface LedgerReportData {
  filters: { ledgerType: string; ledger: string; period: string };
  ledgers: LedgerSection[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** How one posting moves the balance. */
const move = (l: LedgerSection, r: LedgerReportRow) =>
  (l.raisedBy === 'debit' ? 1 : -1) * ((r.debit ?? 0) - (r.credit ?? 0));

/** Closing = opening + what raised it − what lowered it. */
export const ledgerClosing = (l: LedgerSection) =>
  r2(l.opening + l.rows.reduce((a, r) => a + move(l, r), 0));

const colsOf = (l: LedgerSection): PCol[] => [
  { header: 'Date', flex: 0.8 },
  { header: 'Voucher no', flex: 1.15, mono: true, proposed: true },
  { header: 'Particulars', flex: 3.3 },
  { header: `${l.columns.debit} (₹)`, flex: 1.3, align: 'right', mono: true },
  ...(l.columns.credit
    ? [{ header: `${l.columns.credit} (₹)`, flex: 1.3, align: 'right' as const, mono: true }]
    : []),
  { header: `${l.columns.balance} (₹)`, flex: 1.45, align: 'right', mono: true, strong: true },
];

/** Opening, every posting with its running balance, the period totals, then the closing. */
export function ledgerRows(l: LedgerSection): PRow[] {
  const two = l.columns.credit !== null;
  const gap = two ? ['', '', '', ''] : ['', '', ''];
  let bal = l.opening;
  const rows: PRow[] = [{ kind: 'lead', cells: [l.openingLabel, ...gap, amt(l.opening)] }];
  for (const r of l.rows) {
    bal = r2(bal + move(l, r));
    rows.push({
      cells: [
        dShort(r.date),
        r.voucherNo,
        { text: r.particulars, detail: r.detail },
        r.debit ? amt(r.debit) : '',
        ...(two ? [r.credit ? amt(r.credit) : ''] : []),
        { text: amt(bal), color: bal < 0 ? C.danger : undefined },
      ],
    });
  }
  rows.push({
    kind: 'subtotal',
    cells: [
      `Total for the period · ${l.rows.length} entries`,
      '',
      '',
      amt(sum(l.rows, (r) => r.debit ?? 0)),
      ...(two ? [amt(sum(l.rows, (r) => r.credit ?? 0))] : []),
      '',
    ],
  });
  rows.push({ kind: 'total', cells: ['Closing balance', ...gap, amt(ledgerClosing(l))] });
  return rows;
}

const LedgerPage = ({ l }: { l: LedgerSection }) => {
  const debit = sum(l.rows, (r) => r.debit ?? 0);
  const credit = sum(l.rows, (r) => r.credit ?? 0);
  return (
    <>
      <SectionTitle>{`${l.kind} ledger — ${l.name}`}</SectionTitle>
      <Text style={[s.sub, { marginTop: -2 }]}>
        {`${l.descriptor} · ${l.period}  `}
        <Text style={{ color: C.faint }}>{l.caption}</Text>
      </Text>
      <KpiStrip
        items={[
          { l: l.openingLabel, v: rs0(l.opening) },
          { l: l.columns.debit, v: rs0(debit) },
          ...(l.columns.credit ? [{ l: l.columns.credit, v: rs0(credit) }] : []),
          { l: `Closing · ${l.columns.balance}`, v: rs0(ledgerClosing(l)) },
        ]}
      />
      <View style={{ height: 8 }} />
      <PTable cols={colsOf(l)} rows={ledgerRows(l)} />
    </>
  );
};

export const LedgerReportDoc = ({
  data,
  ctx,
}: {
  data: LedgerReportData;
  ctx: ProposalContext;
}) => {
  const f = data.filters;
  return (
    <ProposalDoc
      frame={{
        ...ctx,
        title: 'LEDGER REPORT',
        subtitle:
          'Every entry on one ledger with its running balance: a money account, a customer or supplier, or an expense / income head.',
        filters: [
          { label: 'Ledger type', value: f.ledgerType },
          { label: 'Ledger', value: f.ledger },
          { label: 'Period', value: f.period },
        ],
        notes: [
          {
            text: 'Money accounts (Cash in Hand, Petty Cash, Bank, Merchant Clearing, OMC Wallet, Owner) list the Ledger Entries of that Financial Account; In raises the balance, Out lowers it, as in the Cash Book.',
          },
          {
            text: 'Party ledgers read customer_transactions / supplier_transactions: customer Debit = credit sale or adjustment, Credit = collection; supplier Credit = purchase, Debit = payment. Single-entry: no contra account is posted.',
          },
          {
            text: 'An expense or income head has no account of its own: its ledger is the period’s Expenses (or Income) of that head, with a running total from the start of the financial year (01 Apr).',
          },
          {
            text: 'Voucher numbers on expenses, income and supplier payments (Voucher no, marked *).',
            needs: 'voucher numbering, group B',
          },
        ],
      }}
      pages={data.ledgers.map((l) => (
        <LedgerPage key={l.name} l={l} />
      ))}
    />
  );
};

import React from 'react';
import {
  C,
  KpiStrip,
  PTable,
  ProposalDoc,
  SectionTitle,
  amt,
  dLong,
  rs0,
  sum,
  type PCol,
  type PRow,
  type ProposalContext,
} from './shared.js';

export const VOUCHER_TYPES = [
  'Sale',
  'Credit sale',
  'Collection',
  'Income',
  'Purchase',
  'Decantation',
  'Expense',
  'Supplier payment',
  'Transfer',
  'Settlement',
] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

/**
 * One entry of the day. Debit = money in or a receivable raised (sales,
 * collections, income); Credit = money out or a payable raised (purchases,
 * expenses, supplier payments). A transfer or settlement moves money between
 * the station's own accounts, so it prints in both and nets to nil; a
 * decantation moves stock, not money, and prints in neither.
 */
export interface DayBookEntry {
  time: string;
  type: VoucherType;
  /** Group B for expenses, income and supplier payments. */
  voucherNo: string;
  /** Forecourt entries: the Shift label; Office Records: none. */
  shift: string | null;
  party: string;
  particulars: string;
  detail?: string;
  debit: number | null;
  credit: number | null;
}

export interface DayBookData {
  date: string;
  filters: { voucherType: string; party: string };
  /** Sales of the Business Date, by Shift. */
  forecourt: DayBookEntry[];
  /** Office Records of the Entry Date, plus the day's stock events (product purchases, decantation): no Shift. */
  office: DayBookEntry[];
}

const COLS: PCol[] = [
  { header: 'Time', flex: 0.55, mono: true },
  { header: 'Voucher type', flex: 1.05 },
  { header: 'Voucher no', flex: 1.05, mono: true, proposed: true },
  { header: 'Shift', flex: 0.95, mono: true },
  { header: 'Party / Account', flex: 1.9 },
  { header: 'Particulars', flex: 3.2 },
  { header: 'Debit · in (₹)', flex: 1.25, align: 'right', mono: true },
  { header: 'Credit · out (₹)', flex: 1.25, align: 'right', mono: true },
];

const money = (n: number | null) => (n === null ? '' : amt(n));

/** One world's entries under its band, then their subtotal. */
export function dayBookRows(label: string, detail: string, entries: DayBookEntry[]): PRow[] {
  return [
    { kind: 'group', label, detail },
    ...entries.map((e) => ({
      highlight: e.type === 'Decantation' ? ('muted' as const) : undefined,
      cells: [
        e.time,
        e.type,
        e.voucherNo,
        e.shift ?? '',
        e.party,
        { text: e.particulars, detail: e.detail },
        money(e.debit),
        money(e.credit),
      ],
    })),
    {
      kind: 'subtotal',
      cells: [
        `${label} · ${entries.length} entries`,
        '',
        '',
        '',
        '',
        '',
        amt(sum(entries, (e) => e.debit ?? 0)),
        amt(sum(entries, (e) => e.credit ?? 0)),
      ],
    },
  ];
}

const SUMMARY_COLS: PCol[] = [
  { header: 'Voucher type', flex: 1.6, strong: true },
  { header: 'World', flex: 1.2 },
  { header: 'Entries', flex: 0.7, align: 'right', mono: true },
  { header: 'Debit · in (₹)', flex: 1.4, align: 'right', mono: true },
  { header: 'Credit · out (₹)', flex: 1.4, align: 'right', mono: true },
];

const WORLD: Record<VoucherType, string> = {
  Sale: 'Forecourt',
  'Credit sale': 'Forecourt',
  Collection: 'Office',
  Income: 'Office',
  Purchase: 'Office / stock',
  Decantation: 'Stock (no money)',
  Expense: 'Office',
  'Supplier payment': 'Office',
  Transfer: 'Own accounts',
  Settlement: 'Own accounts',
};

const dash = (n: number) => (n ? amt(n) : '–');

/** Day totals by voucher type; the total row equals the two subtotals of the register. */
export function dayBookSummaryRows(entries: DayBookEntry[]): PRow[] {
  const rows: PRow[] = VOUCHER_TYPES.map((t) => {
    const xs = entries.filter((e) => e.type === t);
    return {
      highlight: xs.length ? undefined : ('muted' as const),
      cells: [
        t,
        WORLD[t],
        String(xs.length),
        dash(sum(xs, (e) => e.debit ?? 0)),
        dash(sum(xs, (e) => e.credit ?? 0)),
      ],
    };
  });
  rows.push({
    kind: 'total',
    cells: [
      'Day total',
      '',
      String(entries.length),
      amt(sum(entries, (e) => e.debit ?? 0)),
      amt(sum(entries, (e) => e.credit ?? 0)),
    ],
  });
  return rows;
}

export const DayBookDoc = ({ data, ctx }: { data: DayBookData; ctx: ProposalContext }) => {
  const f = data.filters;
  const all = [...data.forecourt, ...data.office];
  const of = (...ts: VoucherType[]) =>
    sum(
      all.filter((e) => ts.includes(e.type)),
      (e) => (e.debit ?? 0) + (e.credit ?? 0),
    );
  const day = dLong(data.date);

  return (
    <ProposalDoc
      orientation="landscape"
      frame={{
        ...ctx,
        title: 'DAY BOOK',
        subtitle: `Every entry of ${day}: the forecourt’s sales of that Business Date and the office’s records of that Entry Date. Debit = money in or receivable raised · Credit = money out or payable raised.`,
        filters: [
          { label: 'Date', value: day },
          { label: 'Voucher type', value: f.voucherType },
          { label: 'Account / Party', value: f.party },
        ],
        notes: [
          {
            text: `Sales (fuel from nozzle readings, product, credit) are read by Business Date and Shift; Office Records (collections, expenses, income, supplier payments, fuel purchases, transfers) by Entry Date. One “day” therefore joins the sales of Business Date ${day} — which can run past midnight until the next Day Start — with the office work of calendar date ${day}.`,
          },
          {
            text: 'Convention: Debit = money in or a receivable raised; Credit = money out or a payable raised. Transfers and settlements move money between the station’s own accounts and print in both columns (net nil). Decantation moves stock only and carries no amount.',
          },
          {
            text: 'Not the Daily Cash Book: that is one money account’s opening, in, out and closing. The Day Book lists every voucher of the day across accounts, parties and stock.',
          },
          {
            text: 'Voucher numbers on expenses, income and supplier payments (Voucher no, marked *); this report is unlocked by them.',
            needs: 'voucher numbering, group B',
          },
        ],
      }}
      pages={[
        <React.Fragment key="register">
          <KpiStrip
            items={[
              { l: 'Sales (incl. credit)', v: rs0(of('Sale', 'Credit sale')) },
              { l: 'Collections + income', v: rs0(of('Collection', 'Income')), c: C.success },
              { l: 'Purchases', v: rs0(of('Purchase')) },
              { l: 'Expenses + supplier payments', v: rs0(of('Expense', 'Supplier payment')) },
            ]}
          />
          <SectionTitle>Register</SectionTitle>
          <PTable
            cols={COLS}
            rows={[
              ...dayBookRows(
                'Forecourt',
                `sales of Business Date ${day}, by Shift`,
                data.forecourt,
              ),
              ...dayBookRows(
                'Office & stock',
                `Office Records of Entry Date ${day}; product purchase and decantation of Business Date ${day}; no Shift`,
                data.office,
              ),
            ]}
          />
        </React.Fragment>,
        <React.Fragment key="summary">
          <SectionTitle>Day totals by voucher type</SectionTitle>
          <PTable cols={SUMMARY_COLS} rows={dayBookSummaryRows(all)} />
        </React.Fragment>,
      ]}
    />
  );
};

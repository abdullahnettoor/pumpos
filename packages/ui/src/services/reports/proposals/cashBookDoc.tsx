import React from 'react';
import {
  C,
  KpiStrip,
  PTable,
  ProposalDoc,
  SectionTitle,
  amt,
  dLong,
  dShort,
  num,
  rs0,
  sum,
  type PCol,
  type PRow,
  type ProposalContext,
} from './shared.js';

export type CashBookEntryType =
  | 'Shift close'
  | 'Collection'
  | 'Expense'
  | 'Income'
  | 'Supplier payment'
  | 'Transfer';

/** One Ledger Entry on the cash account, by its Entry Date. */
export interface CashBookEntry {
  /** Entry Date (station-timezone calendar date); a Shift close lands on the date it closed. */
  date: string;
  /** Group-B voucher number (EXP/INC/SPY/TRF); a Shift close carries its Shift Label, a Collection its own number. */
  voucher: string;
  type: CashBookEntryType;
  particulars: string;
  /** Second line under the particulars (counterparty account, expense category). */
  detail?: string;
  /** How a Shift close's cash is made up: office counted + Cash Drops − Opening Floats. */
  shiftCash?: { counted: number; drops: number; floats: number };
  receipt: number;
  payment: number;
}

export interface CashBookDetailDay {
  date: string;
  opening: number;
  entries: CashBookEntry[];
}

export interface CashBookSummaryDay {
  date: string;
  opening: number;
  receipts: number;
  payments: number;
  closing: number;
}

export interface CashBookData {
  account: { name: string; code: string };
  filters: { period: string; detailPeriod: string; entryType: string; voucherType: string };
  /** The days printed entry by entry (a proposal shows a few). */
  detail: CashBookDetailDay[];
  /** Every day of the period: opening, receipts, payments, closing. */
  summary: CashBookSummaryDay[];
}

const DAILY_COLS: PCol[] = [
  { header: 'Date', flex: 0.7 },
  { header: 'Voucher no', flex: 1.1, mono: true, proposed: true },
  { header: 'Entry type', flex: 1.45 },
  { header: 'Particulars', flex: 3.6 },
  { header: 'Receipt (₹)', flex: 1.2, align: 'right', mono: true },
  { header: 'Payment (₹)', flex: 1.2, align: 'right', mono: true },
  { header: 'Balance (₹)', flex: 1.3, align: 'right', mono: true, strong: true },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};

const balanceCell = (n: number) => ({ text: amt(n), color: n < 0 ? C.danger : undefined });

const particulars = (e: CashBookEntry) => ({
  text: e.particulars,
  detail: e.shiftCash
    ? `Counted ${amt(e.shiftCash.counted)} + drops ${num(e.shiftCash.drops, 0)} − floats ${num(e.shiftCash.floats, 0)}`
    : e.detail,
});

/** One day, entry by entry: opening, the entries with a running balance, day totals, closing. */
export function cashBookDayRows(day: CashBookDetailDay): PRow[] {
  const rows: PRow[] = [{ kind: 'group', label: `${weekday(day.date)} ${dLong(day.date)}` }];
  rows.push({
    kind: 'lead',
    cells: ['Opening balance', '', '', '', '', '', balanceCell(day.opening)],
  });
  let balance = day.opening;
  for (const e of day.entries) {
    balance = Math.round((balance + e.receipt - e.payment) * 100) / 100;
    rows.push({
      cells: [
        dShort(e.date),
        e.voucher,
        e.type,
        particulars(e),
        e.receipt ? amt(e.receipt) : '',
        e.payment ? amt(e.payment) : '',
        balanceCell(balance),
      ],
    });
  }
  const receipts = sum(day.entries, (e) => e.receipt);
  const payments = sum(day.entries, (e) => e.payment);
  rows.push({
    kind: 'subtotal',
    cells: [
      `Day total (${day.entries.length} entries) · closing balance`,
      '',
      '',
      '',
      amt(receipts),
      amt(payments),
      balanceCell(balance),
    ],
  });
  return rows;
}

const SUMMARY_COLS: PCol[] = [
  { header: 'Date', flex: 1.2 },
  { header: 'Opening (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Receipts (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Payments (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Closing (₹)', flex: 1.3, align: 'right', mono: true, strong: true },
];

const summaryRows = (days: CashBookSummaryDay[]): PRow[] =>
  days.map((d) => ({
    cells: [
      `${weekday(d.date)} ${dShort(d.date)}`,
      amt(d.opening),
      amt(d.receipts),
      amt(d.payments),
      balanceCell(d.closing),
    ],
  }));

export const CashBookDoc = ({ data, ctx }: { data: CashBookData; ctx: ProposalContext }) => {
  const f = data.filters;
  const days = data.summary;
  const first = days[0];
  const last = days[days.length - 1];
  const receipts = sum(days, (d) => d.receipts);
  const payments = sum(days, (d) => d.payments);

  return (
    <ProposalDoc
      frame={{
        ...ctx,
        title: 'CASH BOOK',
        subtitle: `${data.account.name} (${data.account.code}): every receipt and payment by Entry Date, with a running balance and a day-by-day summary.`,
        filters: [
          { label: 'Account', value: data.account.name },
          { label: 'Period', value: f.period },
          { label: 'Entry type', value: f.entryType },
          { label: 'Voucher type', value: f.voucherType, proposed: true },
        ],
        notes: [
          {
            text: `From the ${data.account.name} account's Ledger Entries by Entry Date (station-timezone calendar date, no Day Start rollback): the same figures as the Daily Cash Book screen.`,
          },
          {
            text: 'A Shift close lands on the calendar date of the close: office counted cash + that Shift’s Cash Drops − its Opening Floats. “Counted” is the Office row of the Shift Cash Variance report.',
          },
          {
            text: 'Voucher numbers for Expenses (EXP), Income (INC), Supplier Payments (SPY) and transfers (TRF), and the Voucher type filter (marked *).',
            needs: 'voucher numbering for office records, group B',
          },
        ],
      }}
      pages={[
        <React.Fragment key="daily">
          <KpiStrip
            items={[
              { l: `Opening ${dShort(first.date)}`, v: rs0(first.opening) },
              { l: 'Receipts (month)', v: rs0(receipts), c: C.success },
              { l: 'Payments (month)', v: rs0(payments) },
              { l: `Closing ${dShort(last.date)}`, v: rs0(last.closing) },
            ]}
          />
          <SectionTitle>{`Daily view — ${f.detailPeriod} (sample days)`}</SectionTitle>
          <PTable cols={DAILY_COLS} rows={data.detail.flatMap(cashBookDayRows)} />
        </React.Fragment>,
        <React.Fragment key="summary">
          <SectionTitle>{`Monthly summary — ${f.period}`}</SectionTitle>
          <PTable
            cols={SUMMARY_COLS}
            rows={[
              ...summaryRows(days),
              {
                kind: 'total',
                cells: [
                  'Month',
                  amt(first.opening),
                  amt(receipts),
                  amt(payments),
                  balanceCell(last.closing),
                ],
              },
            ]}
          />
        </React.Fragment>,
      ]}
    />
  );
};

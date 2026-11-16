import React from 'react';
import {
  AgeingStrip,
  C,
  Column,
  Columns,
  PTable,
  ProposalDoc,
  SectionTitle,
  amt,
  dLong,
  dShort,
  pct,
  rs0,
  sum,
  type PCol,
  type PRow,
  type ProposalContext,
  BUCKET_TONES,
} from './shared.js';

/** The four ageing buckets, by days since the sale's Business Date. */
export const DEBTOR_BUCKETS = ['0–30', '31–60', '61–90', '90+'] as const;
export type DebtorBucket = (typeof DEBTOR_BUCKETS)[number];

/** One Customer's standing on the As-of date: balance split by age. */
export interface DebtorLine {
  customer: string;
  phone: string;
  type: 'Fleet' | 'Credit' | 'Regular';
  /** Null when the Customer has no Credit Limit (no standing to judge). */
  limit: number | null;
  /** Σ credit sales − Σ collections; a negative balance is an advance. */
  balance: number;
  buckets: Record<DebtorBucket, number>;
}

/** One unpaid (or part-paid) Credit Sale after FIFO settlement. */
export interface DebtorBill {
  date: string;
  docNo: string;
  vehicle: string;
  amount: number;
  /** Collections / credit adjustments applied to this bill, oldest first. */
  received: number;
  balance: number;
  days: number;
  bucket: DebtorBucket;
}

export interface DebtorDetail {
  customer: string;
  type: string;
  /** Group-B: the Customer's credit days, for the due date. */
  creditDays: number;
  bills: DebtorBill[];
}

/** A due-date window: what falls due in it (group B: needs credit days). */
export interface DueWindow {
  label: string;
  bills: number;
  amount: number;
}

export interface DebtorsAgeingData {
  asOf: string;
  filters: { customer: string; customerType: string; bucket: string; overLimitOnly: string };
  lines: DebtorLine[];
  detail: DebtorDetail[];
  due: DueWindow[];
}

/** Share of the Credit Limit used; null without a limit. */
const usedOf = (l: DebtorLine) => (l.limit ? (l.balance / l.limit) * 100 : null);

const SUMMARY_COLS: PCol[] = [
  { header: 'Customer', flex: 2.4, strong: true },
  { header: 'Phone', flex: 1.2 },
  { header: 'Type', flex: 0.7 },
  { header: 'Credit limit (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Balance (₹)', flex: 1.4, align: 'right', mono: true, strong: true },
  { header: '0–30 (₹)', flex: 1.2, align: 'right', mono: true },
  { header: '31–60 (₹)', flex: 1.2, align: 'right', mono: true },
  { header: '61–90 (₹)', flex: 1.2, align: 'right', mono: true },
  { header: '90+ (₹)', flex: 1.2, align: 'right', mono: true },
  { header: 'Limit used', flex: 1.3, align: 'right' },
];

const bucketCells = (b: Record<DebtorBucket, number>) =>
  DEBTOR_BUCKETS.map((k) => (b[k] ? amt(b[k]) : '–'));

/** The Customer-wise table: over-limit rows red, near-limit (80%+) amber, then the totals. */
export function debtorSummaryRows(lines: DebtorLine[]): PRow[] {
  const rows: PRow[] = lines.map((l) => {
    const used = usedOf(l);
    const over = used !== null && used > 100;
    const near = used !== null && !over && used >= 80;
    return {
      highlight: over ? 'danger' : near ? 'warn' : undefined,
      cells: [
        l.customer,
        l.phone,
        l.type,
        l.limit ? amt(l.limit) : 'No limit',
        amt(l.balance),
        ...bucketCells(l.buckets),
        used === null
          ? ''
          : over
            ? { text: `Over · ${pct(used, 0)}`, color: C.danger, bold: true }
            : near
              ? { text: `Near · ${pct(used, 0)}`, color: C.amber }
              : { text: pct(used, 0), color: C.muted },
      ],
    };
  });
  const total = sum(lines, (l) => l.balance);
  rows.push({
    kind: 'total',
    cells: [
      `Total · ${lines.length} customers`,
      '',
      '',
      '',
      amt(total),
      ...DEBTOR_BUCKETS.map((k) => amt(sum(lines, (l) => l.buckets[k]))),
      '',
    ],
  });
  return rows;
}

const BILL_COLS: PCol[] = [
  { header: 'Sale date', flex: 1 },
  { header: 'Doc no', flex: 1.1, mono: true },
  { header: 'Vehicle', flex: 1.3, mono: true },
  { header: 'Amount (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Received · FIFO (₹)', flex: 1.4, align: 'right', mono: true },
  { header: 'Balance (₹)', flex: 1.3, align: 'right', mono: true, strong: true },
  { header: 'Days', flex: 0.6, align: 'right', mono: true },
  { header: 'Bucket', flex: 0.7, align: 'center' },
  { header: 'Due date', flex: 1, proposed: true },
];

const BUCKET_TONE: Record<DebtorBucket, string | undefined> = {
  '0–30': undefined,
  '31–60': C.amber,
  '61–90': BUCKET_TONES[2],
  '90+': C.danger,
};

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Bill-wise detail: a band per Customer, its open bills, and a subtotal equal to its summary line. */
export function debtorBillRows(detail: DebtorDetail[]): PRow[] {
  const rows: PRow[] = [];
  for (const d of detail) {
    rows.push({
      kind: 'group',
      label: d.customer,
      detail: `${d.type} · ${d.bills.length} open bills · ${d.creditDays} credit days*`,
    });
    for (const b of d.bills) {
      rows.push({
        cells: [
          dLong(b.date),
          b.docNo,
          b.vehicle,
          amt(b.amount),
          b.received ? amt(b.received) : '–',
          amt(b.balance),
          String(b.days),
          { text: b.bucket, color: BUCKET_TONE[b.bucket] },
          dShort(addDays(b.date, d.creditDays)),
        ],
      });
    }
    const split = DEBTOR_BUCKETS.map(
      (k) =>
        `${k}: ${amt(
          sum(
            d.bills.filter((b) => b.bucket === k),
            (b) => b.balance,
          ),
        )}`,
    ).join('  ·  ');
    rows.push({
      kind: 'subtotal',
      cells: [
        { text: `${d.customer} — balance`, detail: split },
        '',
        '',
        amt(sum(d.bills, (b) => b.amount)),
        amt(sum(d.bills, (b) => b.received)),
        amt(sum(d.bills, (b) => b.balance)),
        '',
        '',
        '',
      ],
    });
  }
  return rows;
}

const DUE_COLS: PCol[] = [
  { header: 'Falls due', flex: 1.6 },
  { header: 'Bills', flex: 0.6, align: 'right', mono: true },
  { header: 'Amount (₹)', flex: 1.2, align: 'right', mono: true, strong: true },
];

const TYPE_COLS: PCol[] = [
  { header: 'Customer type', flex: 1.4 },
  { header: 'Customers', flex: 0.8, align: 'right', mono: true },
  { header: 'Balance (₹)', flex: 1.2, align: 'right', mono: true, strong: true },
  { header: '61+ days (₹)', flex: 1.2, align: 'right', mono: true },
];

export const DebtorsAgeingDoc = ({
  data,
  ctx,
}: {
  data: DebtorsAgeingData;
  ctx: ProposalContext;
}) => {
  const f = data.filters;
  const total = sum(data.lines, (l) => l.balance);
  const over = data.lines.filter((l) => (usedOf(l) ?? 0) > 100);
  const overBy = sum(over, (l) => l.balance - (l.limit ?? 0));
  const old = sum(data.lines, (l) => l.buckets['61–90'] + l.buckets['90+']);
  const types = [...new Set(data.lines.map((l) => l.type))];

  return (
    <ProposalDoc
      orientation="landscape"
      frame={{
        ...ctx,
        title: 'SUNDRY DEBTORS — RECEIVABLES WITH AGEING',
        subtitle: `What each Customer owes on ${dLong(data.asOf)} (${rs0(total)}; ${over.length} over limit by ${rs0(overBy)}), and how long each unpaid credit sale has waited.`,
        filters: [
          { label: 'As of', value: dLong(data.asOf) },
          { label: 'Customer', value: f.customer },
          { label: 'Customer type', value: f.customerType },
          { label: 'Bucket', value: f.bucket },
          { label: 'Over limit only', value: f.overLimitOnly },
        ],
        notes: [
          {
            text: 'Balance = credit sales − collections on the customer ledger (customer_transactions). A negative balance is an advance, not a negative receivable.',
          },
          {
            text: 'Collections and credit adjustments settle the oldest unpaid amount first (FIFO), as the app’s Receivable aging does; what is left of each credit sale is aged from its Business Date to the As-of date.',
          },
          {
            text: 'Open question: the app’s Receivable aging uses 0–7 / 8–30 / 30+ day buckets; this report proposes 30-day buckets (0–30 / 31–60 / 61–90 / 90+). One set, or both?',
          },
          {
            text: 'Due date column and the “Falls due” block (marked *).',
            needs: 'credit days on customers, group B',
          },
        ],
      }}
      pages={[
        <React.Fragment key="summary">
          <AgeingStrip
            buckets={DEBTOR_BUCKETS.map((k) => ({
              label: `${k} days`,
              amount: sum(data.lines, (l) => l.buckets[k]),
            }))}
          />
          <SectionTitle>Customer-wise ageing</SectionTitle>
          <PTable cols={SUMMARY_COLS} rows={debtorSummaryRows(data.lines)} />
          <Columns>
            <Column>
              <SectionTitle tag="proposed · needs credit days">Falls due</SectionTitle>
              <PTable
                cols={DUE_COLS}
                rows={[
                  ...data.due.map((w) => ({
                    cells: [
                      w.label === 'Overdue'
                        ? { text: w.label, color: C.danger, bold: true }
                        : w.label,
                      String(w.bills),
                      amt(w.amount),
                    ],
                  })),
                  {
                    kind: 'total' as const,
                    cells: [
                      'Total',
                      String(data.due.reduce((a, w) => a + w.bills, 0)),
                      amt(sum(data.due, (w) => w.amount)),
                    ],
                  },
                ]}
              />
            </Column>
            <Column>
              <SectionTitle>By customer type</SectionTitle>
              <PTable
                cols={TYPE_COLS}
                rows={[
                  ...types.map((t) => {
                    const ls = data.lines.filter((l) => l.type === t);
                    return {
                      cells: [
                        t,
                        String(ls.length),
                        amt(sum(ls, (l) => l.balance)),
                        amt(sum(ls, (l) => l.buckets['61–90'] + l.buckets['90+'])),
                      ],
                    };
                  }),
                  {
                    kind: 'total' as const,
                    cells: ['Total', String(data.lines.length), amt(total), amt(old)],
                  },
                ]}
              />
            </Column>
          </Columns>
        </React.Fragment>,
        ...data.detail.map((d) => (
          <React.Fragment key={d.customer}>
            <SectionTitle>{`Bill-wise detail — ${d.customer}`}</SectionTitle>
            <PTable cols={BILL_COLS} rows={debtorBillRows([d])} />
          </React.Fragment>
        )),
      ]}
    />
  );
};

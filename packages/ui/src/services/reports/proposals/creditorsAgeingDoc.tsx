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
  rs,
  rs0,
  sum,
  type PCol,
  type PRow,
  type ProposalContext,
  BUCKET_TONES,
} from './shared.js';

/** The four ageing buckets, by days since the purchase's date. */
export const CREDITOR_BUCKETS = ['0–30', '31–60', '61–90', '90+'] as const;
export type CreditorBucket = (typeof CREDITOR_BUCKETS)[number];

/** One supplier's standing with this Station on the As-of date. */
export interface CreditorLine {
  supplier: string;
  gstin: string;
  /** Σ purchases − Σ supplier payments; negative is an advance (paid ahead). */
  balance: number;
  buckets: Record<CreditorBucket, number>;
  /** Date of the oldest unpaid purchase; null when nothing is unpaid. */
  oldestUnpaid: string | null;
}

/** One unpaid (or part-paid) purchase after FIFO settlement. */
export interface CreditorBill {
  date: string;
  billNo: string;
  kind: 'Fuel' | 'Product';
  amount: number;
  /** Supplier payments / credit adjustments applied to this bill, oldest first. */
  paid: number;
  balance: number;
  days: number;
  bucket: CreditorBucket;
}

export interface CreditorDetail {
  supplier: string;
  /** Group-B: credit days the supplier allows, for the due date. */
  creditDays: number | null;
  bills: CreditorBill[];
  /** Paid ahead of purchases (shown instead of bills when there are none). */
  advance: number;
}

export interface PayableDueWindow {
  label: string;
  bills: number;
  amount: number;
}

/** A supplier's month on its ledger: how the balance got where it is. */
export interface CreditorMovement {
  supplier: string;
  opening: number;
  purchases: number;
  payments: number;
}

export interface CreditorsAgeingData {
  asOf: string;
  /** The month ending on the As-of date. */
  monthLabel: string;
  movement: CreditorMovement[];
  filters: { supplier: string; purchaseType: string; bucket: string };
  lines: CreditorLine[];
  detail: CreditorDetail[];
  due: PayableDueWindow[];
}

const SUMMARY_COLS: PCol[] = [
  { header: 'Supplier', flex: 2.4, strong: true },
  { header: 'GSTIN', flex: 1.7, mono: true },
  { header: 'Balance (₹)', flex: 1.6, align: 'right', mono: true, strong: true },
  { header: '0–30 (₹)', flex: 1.3, align: 'right', mono: true },
  { header: '31–60 (₹)', flex: 1.3, align: 'right', mono: true },
  { header: '61–90 (₹)', flex: 1.3, align: 'right', mono: true },
  { header: '90+ (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Oldest unpaid', flex: 1.1, align: 'right' },
];

const bucketCells = (b: Record<CreditorBucket, number>) =>
  CREDITOR_BUCKETS.map((k) => (b[k] ? amt(b[k]) : '–'));

/** Supplier-wise table: what is payable, advances shown apart, then the net. */
export function creditorSummaryRows(lines: CreditorLine[]): PRow[] {
  const rows: PRow[] = lines.map((l) =>
    l.balance < 0
      ? {
          cells: [
            l.supplier,
            l.gstin,
            { text: `Advance ${amt(-l.balance)}`, color: C.success },
            '–',
            '–',
            '–',
            '–',
            { text: 'Paid ahead', color: C.muted },
          ],
        }
      : {
          highlight: l.buckets['90+'] > 0 ? 'warn' : undefined,
          cells: [
            l.supplier,
            l.gstin,
            amt(l.balance),
            ...bucketCells(l.buckets),
            l.oldestUnpaid ? dShort(l.oldestUnpaid) : '',
          ],
        },
  );
  const payable = lines.filter((l) => l.balance > 0);
  const advances = lines.filter((l) => l.balance < 0);
  rows.push({
    kind: 'subtotal',
    cells: [
      `Total payable · ${payable.length} suppliers`,
      '',
      amt(sum(payable, (l) => l.balance)),
      ...CREDITOR_BUCKETS.map((k) => amt(sum(payable, (l) => l.buckets[k]))),
      '',
    ],
  });
  rows.push({
    kind: 'subtotal',
    cells: [
      `Advances with suppliers · ${advances.length}`,
      '',
      { text: amt(sum(advances, (l) => l.balance)), color: C.success },
      '',
      '',
      '',
      '',
      '',
    ],
  });
  rows.push({
    kind: 'total',
    cells: ['Net owed to suppliers', '', amt(sum(lines, (l) => l.balance)), '', '', '', '', ''],
  });
  return rows;
}

const BILL_COLS: PCol[] = [
  { header: 'Bill date', flex: 1 },
  { header: 'Bill no', flex: 1.4, mono: true },
  { header: 'Type', flex: 0.7 },
  { header: 'Amount (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Paid · FIFO (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Balance (₹)', flex: 1.3, align: 'right', mono: true, strong: true },
  { header: 'Days', flex: 0.6, align: 'right', mono: true },
  { header: 'Bucket', flex: 0.7, align: 'center' },
  { header: 'Due date', flex: 0.9, proposed: true },
];

const BUCKET_TONE: Record<CreditorBucket, string | undefined> = {
  '0–30': undefined,
  '31–60': C.amber,
  '61–90': BUCKET_TONES[2],
  '90+': C.danger,
};

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Bill-wise detail: a band per supplier, its unpaid bills and a subtotal equal to its summary line. */
export function creditorBillRows(detail: CreditorDetail[]): PRow[] {
  const rows: PRow[] = [];
  for (const d of detail) {
    if (!d.bills.length) {
      rows.push({
        kind: 'group',
        label: d.supplier,
        detail: d.advance
          ? `no unpaid purchases · advance ${rs(d.advance)} paid ahead, waits for the next invoice`
          : 'no unpaid purchases',
      });
      continue;
    }
    rows.push({
      kind: 'group',
      label: d.supplier,
      detail: `${d.bills.length} unpaid bills${d.creditDays ? ` · ${d.creditDays} credit days*` : ''}`,
    });
    for (const b of d.bills) {
      rows.push({
        cells: [
          dLong(b.date),
          b.billNo,
          b.kind,
          amt(b.amount),
          b.paid ? amt(b.paid) : '–',
          amt(b.balance),
          String(b.days),
          { text: b.bucket, color: BUCKET_TONE[b.bucket] },
          d.creditDays ? dShort(addDays(b.date, d.creditDays)) : '',
        ],
      });
    }
    const split = CREDITOR_BUCKETS.map(
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
        { text: `${d.supplier} — balance`, detail: split },
        '',
        '',
        amt(sum(d.bills, (b) => b.amount)),
        amt(sum(d.bills, (b) => b.paid)),
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

const MOVE_COLS: PCol[] = [
  { header: 'Supplier', flex: 2.2 },
  { header: 'Opening (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Purchases (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Payments (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Closing (₹)', flex: 1.3, align: 'right', mono: true, strong: true },
];

/** Opening + purchases − payments = closing; a negative side reads as an advance. */
const side = (n: number) => (n < 0 ? { text: `Adv ${amt(-n)}`, color: C.success } : amt(n));
function movementRows(ms: CreditorMovement[]): PRow[] {
  const close = (m: CreditorMovement) =>
    Math.round((m.opening + m.purchases - m.payments) * 100) / 100;
  return [
    ...ms.map((m) => ({
      cells: [m.supplier, side(m.opening), amt(m.purchases), amt(m.payments), side(close(m))],
    })),
    {
      kind: 'total' as const,
      cells: [
        'Net',
        side(sum(ms, (m) => m.opening)),
        amt(sum(ms, (m) => m.purchases)),
        amt(sum(ms, (m) => m.payments)),
        side(sum(ms, close)),
      ],
    },
  ];
}

export const CreditorsAgeingDoc = ({
  data,
  ctx,
}: {
  data: CreditorsAgeingData;
  ctx: ProposalContext;
}) => {
  const f = data.filters;
  const payable = data.lines.filter((l) => l.balance > 0);
  const total = sum(payable, (l) => l.balance);
  const advance = -sum(
    data.lines.filter((l) => l.balance < 0),
    (l) => l.balance,
  );

  return (
    <ProposalDoc
      orientation="landscape"
      frame={{
        ...ctx,
        title: 'SUNDRY CREDITORS — PAYABLES WITH AGEING',
        subtitle: `What this Station owes each supplier on ${dLong(data.asOf)} (${rs0(total)} payable; ${rs0(advance)} paid ahead), and how long each unpaid purchase has waited.`,
        filters: [
          { label: 'As of', value: dLong(data.asOf) },
          { label: 'Supplier', value: f.supplier },
          { label: 'Purchase type', value: f.purchaseType },
          { label: 'Bucket', value: f.bucket },
        ],
        notes: [
          {
            text: 'Payables per Station = purchases − supplier payments on that Station’s supplier ledger (supplier_transactions). An overpayment is an advance (paid ahead), never a negative payable.',
          },
          {
            text: 'Supplier payments and credit adjustments settle the oldest unpaid amount first (FIFO). Age counts from the purchase’s Business Date; a Fuel Purchase (an Office Record) ages from its Entry Date.',
          },
          {
            text: 'Suppliers have no payment terms today, so no due date exists; the Due date column and the “Falls due” block (marked *) are proposals.',
            needs: 'credit days on suppliers, group B',
          },
        ],
      }}
      pages={[
        <React.Fragment key="summary">
          <AgeingStrip
            buckets={CREDITOR_BUCKETS.map((k) => ({
              label: `${k} days`,
              amount: sum(payable, (l) => l.buckets[k]),
            }))}
          />
          <SectionTitle>Supplier-wise ageing</SectionTitle>
          <PTable cols={SUMMARY_COLS} rows={creditorSummaryRows(data.lines)} />
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
                      'Total payable',
                      String(data.due.reduce((a, w) => a + w.bills, 0)),
                      amt(sum(data.due, (w) => w.amount)),
                    ],
                  },
                ]}
              />
            </Column>
            <Column flex={1.4}>
              <SectionTitle>{`Movement — ${data.monthLabel}`}</SectionTitle>
              <PTable cols={MOVE_COLS} rows={movementRows(data.movement)} />
            </Column>
          </Columns>
        </React.Fragment>,
        <React.Fragment key="bills">
          <SectionTitle>Bill-wise detail — unpaid purchases after FIFO</SectionTitle>
          <PTable cols={BILL_COLS} rows={creditorBillRows(data.detail)} />
        </React.Fragment>,
      ]}
    />
  );
};

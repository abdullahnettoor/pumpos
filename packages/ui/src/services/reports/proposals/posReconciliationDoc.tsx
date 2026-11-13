import React from 'react';
import {
  C,
  KpiStrip,
  PTable,
  ProposalDoc,
  SectionTitle,
  amt,
  amtSigned,
  dLong,
  dShort,
  rs0,
  sum,
  varTone,
  type PCell,
  type PCol,
  type PRow,
  type ProposalContext,
} from './shared.js';

export type PosMode = 'Cash' | 'Card' | 'UPI' | 'Credit' | 'OMC card';

/** One day's sales in one mode (and terminal), traced to what was declared and settled. */
export interface PosReconLine {
  date: string;
  mode: PosMode;
  /** Payment Terminal and batch (card/UPI), Drawers (cash), Customer ledger, OMC Wallet. */
  terminal: string;
  /** One line under the terminal: when it was credited, or why it is open. */
  remark?: string;
  /** `pending`: a batch not yet credited; `difference`: credited, but not the declared amount. */
  status?: 'pending' | 'difference';
  /** From the Shift Summaries' payment split. */
  recorded: number;
  /** Handover declaration (cash: declared + drops − floats; card/UPI: terminal totals). Null where none exists. */
  declared: number | null;
  /** Settlement credited to Bank (or OMC Wallet). Null where a mode never settles (cash, credit). */
  settled: number | null;
  /** MDR / bank charges deducted from the settlement. */
  charges: number | null;
  /** Card/UPI/OMC: declared − settled − charges (still to come). Cash: declared − recorded. */
  difference: number | null;
}

export interface PosReconciliationData {
  /** Settlements are counted up to this date: a batch credited later shows as unsettled. */
  filters: { period: string; settledTo: string; mode: string; terminal: string };
  lines: PosReconLine[];
}

const MODES: PosMode[] = ['Cash', 'Card', 'UPI', 'Credit', 'OMC card'];
const DASH = '—';
const money = (n: number | null) => (n === null ? DASH : amt(n));
const settlesToAccount = (m: PosMode) => m === 'Card' || m === 'UPI' || m === 'OMC card';

const differenceCell = (l: Pick<PosReconLine, 'mode' | 'difference'>, bold = false): PCell => {
  if (l.difference === null) return DASH;
  if (l.mode === 'Cash')
    return { text: amtSigned(l.difference), color: varTone(l.difference), bold };
  return {
    text: amt(l.difference),
    color: l.difference > 0.005 ? C.danger : undefined,
    bold,
  };
};

const COLS: PCol[] = [
  { header: 'Date', flex: 0.7 },
  { header: 'Mode', flex: 0.8, strong: true },
  { header: 'Terminal / batch ref', flex: 2.4 },
  { header: 'Sales recorded (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Declared at handover (₹)', flex: 1.45, align: 'right', mono: true },
  { header: 'Settled (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Bank charges (₹)', flex: 1.1, align: 'right', mono: true },
  { header: 'Unsettled / difference (₹)', flex: 1.5, align: 'right', mono: true, strong: true },
];

/** The register: a band per date, then one row per mode (and terminal). */
export function posReconRows(lines: PosReconLine[]): PRow[] {
  const dates = [...new Set(lines.map((l) => l.date))];
  return dates.flatMap((date): PRow[] => {
    const day = lines.filter((l) => l.date === date);
    return [
      {
        kind: 'group',
        label: dLong(date),
        detail: `sales recorded ${rs0(sum(day, (l) => l.recorded))}`,
      },
      ...day.map((l): PRow => ({
        highlight:
          l.status === 'pending' ? 'warn' : l.status === 'difference' ? 'danger' : undefined,
        cells: [
          dShort(l.date),
          l.mode,
          { text: l.terminal, detail: l.remark },
          amt(l.recorded),
          money(l.declared),
          money(l.settled),
          money(l.charges),
          differenceCell(l),
        ],
      })),
    ];
  });
}

const TOTAL_COLS: PCol[] = [
  { header: 'Mode', flex: 1.2, strong: true },
  { header: 'Settles into', flex: 1.6 },
  { header: 'Sales recorded (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Declared at handover (₹)', flex: 1.45, align: 'right', mono: true },
  { header: 'Settled (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Bank charges (₹)', flex: 1.1, align: 'right', mono: true },
  { header: 'Unsettled / difference (₹)', flex: 1.5, align: 'right', mono: true, strong: true },
];

const SETTLES_INTO: Record<PosMode, string> = {
  Cash: 'Cash in Hand (Shift close)',
  Card: 'Merchant Clearing → Bank',
  UPI: 'Merchant Clearing → Bank',
  Credit: 'Customer ledger',
  'OMC card': 'OMC Wallet (CMS)',
};

const sumOrNull = (xs: (number | null)[]) =>
  xs.every((x) => x === null) ? null : sum(xs, (x) => x ?? 0);

/** Totals by mode, then the grand total (its difference counts only what is still to be settled). */
export function posModeTotalRows(lines: PosReconLine[]): PRow[] {
  const rows: PRow[] = MODES.map((mode) => {
    const ls = lines.filter((l) => l.mode === mode);
    const difference = sumOrNull(ls.map((l) => l.difference));
    return {
      highlight: settlesToAccount(mode) && (difference ?? 0) > 0.005 ? 'warn' : undefined,
      cells: [
        mode,
        SETTLES_INTO[mode],
        amt(sum(ls, (l) => l.recorded)),
        money(sumOrNull(ls.map((l) => l.declared))),
        money(sumOrNull(ls.map((l) => l.settled))),
        money(sumOrNull(ls.map((l) => l.charges))),
        differenceCell({ mode, difference }),
      ],
    };
  });
  const settling = lines.filter((l) => settlesToAccount(l.mode));
  rows.push({
    kind: 'total',
    cells: [
      'All modes',
      '',
      amt(sum(lines, (l) => l.recorded)),
      amt(sum(lines, (l) => l.declared ?? 0)),
      amt(sum(lines, (l) => l.settled ?? 0)),
      amt(sum(lines, (l) => l.charges ?? 0)),
      { text: amt(sum(settling, (l) => l.difference ?? 0)), detail: 'unsettled: card + UPI + OMC' },
    ],
  });
  return rows;
}

export const PosReconciliationDoc = ({
  data,
  ctx,
}: {
  data: PosReconciliationData;
  ctx: ProposalContext;
}) => {
  const f = data.filters;
  const digital = data.lines.filter((l) => l.mode === 'Card' || l.mode === 'UPI');
  const unsettled = sum(digital, (l) => l.difference ?? 0);

  return (
    <ProposalDoc
      orientation="landscape"
      frame={{
        ...ctx,
        title: 'POS COLLECTION & RECONCILIATION',
        subtitle:
          'Sales by payment mode and terminal, against what was declared at Handover and what actually settled to the bank.',
        filters: [
          { label: 'Period', value: f.period },
          { label: 'Settlements up to', value: f.settledTo },
          { label: 'Mode', value: f.mode },
          { label: 'Terminal', value: f.terminal },
        ],
        notes: [
          {
            text: 'Sales recorded: the Shift Summaries’ payment split, summed over the day’s Shifts. Declared: Handover declarations (cash: declared + drops − floats; card/UPI: each Payment Terminal’s total).',
          },
          {
            text: 'Settled: the settlement entries from Merchant Clearing to Bank (bank charges = MDR, ~0.9% card, 0% UPI); OMC card sales settle into the OMC Wallet (the CMS account). There is no separate “wallet” payment mode today.',
          },
          {
            text: 'Cash never settles here: its difference is the attendant variance, and the cash reaches Cash in Hand at Shift close (see the Cash Book). Credit is a receivable (see Sundry Debtors). The grand-total difference counts card, UPI and OMC only.',
          },
          {
            text: 'Matching a settlement to its batch is future work: today the difference is per day and terminal, not per batch.',
          },
        ],
      }}
      pages={[
        <React.Fragment key="p1">
          <KpiStrip
            items={[
              { l: 'Card + UPI sales', v: rs0(sum(digital, (l) => l.recorded)) },
              { l: 'Settled to bank', v: rs0(sum(digital, (l) => l.settled ?? 0)), c: C.success },
              { l: 'MDR / bank charges', v: rs0(sum(digital, (l) => l.charges ?? 0)) },
              { l: 'Unsettled', v: rs0(unsettled), c: unsettled > 0 ? C.danger : undefined },
            ]}
          />
          <SectionTitle>{`Totals by mode — ${f.period}`}</SectionTitle>
          <PTable cols={TOTAL_COLS} rows={posModeTotalRows(data.lines)} />
          <SectionTitle>By date and mode</SectionTitle>
          <PTable cols={COLS} rows={posReconRows(data.lines)} />
        </React.Fragment>,
      ]}
    />
  );
};

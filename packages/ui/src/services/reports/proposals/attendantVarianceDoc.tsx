import React from 'react';
import { View } from '@react-pdf/renderer';
import {
  C,
  KpiStrip,
  PTable,
  ProposalDoc,
  SectionTitle,
  amt,
  amtSigned,
  dShort,
  rs,
  sum,
  varTone,
  type PCell,
  type PCol,
  type PRow,
  type ProposalContext,
} from './shared.js';

/** One Drawer at Handover with a non-zero attendant variance. */
export interface AttendantVarianceLine {
  date: string;
  shift: string;
  du: string;
  /** Opening Float + DU cash sales − Cash Drops. */
  expected: number;
  declared: number;
  /** declared − expected (negative = short). */
  variance: number;
}

export interface AttendantVarianceGroup {
  attendant: string;
  /** Drawers the Attendant handed over in the period (with or without a variance). */
  shifts: number;
  lines: AttendantVarianceLine[];
}

export interface AttendantVarianceData {
  filters: { period: string; attendant: string; du: string; nonZeroOnly: string };
  attendants: AttendantVarianceGroup[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface AttendantVarianceSummary {
  attendant: string;
  shifts: number;
  short: number;
  excess: number;
  net: number;
  largestShort: number;
  shiftsShort: number;
}

export function attendantSummary(g: AttendantVarianceGroup): AttendantVarianceSummary {
  const shorts = g.lines.filter((l) => l.variance < 0);
  const short = sum(shorts, (l) => l.variance);
  const excess = sum(
    g.lines.filter((l) => l.variance > 0),
    (l) => l.variance,
  );
  return {
    attendant: g.attendant,
    shifts: g.shifts,
    short,
    excess,
    net: r2(short + excess),
    largestShort: shorts.reduce((a, l) => Math.min(a, l.variance), 0),
    shiftsShort: shorts.length,
  };
}

const variance = (n: number, bold = false): PCell => ({
  text: amtSigned(n),
  color: varTone(n),
  bold,
});

const SUMMARY_COLS: PCol[] = [
  { header: 'Attendant', flex: 1.4, strong: true },
  { header: 'Shifts', flex: 0.6, align: 'right', mono: true },
  { header: 'Total short (₹)', flex: 1.2, align: 'right', mono: true },
  { header: 'Total excess (₹)', flex: 1.2, align: 'right', mono: true },
  { header: 'Net (₹)', flex: 1.1, align: 'right', mono: true, strong: true },
  { header: 'Largest single short (₹)', flex: 1.5, align: 'right', mono: true },
  { header: 'Shifts short', flex: 0.9, align: 'right', mono: true },
];

const summaryCells = (s: Omit<AttendantVarianceSummary, 'attendant'>, label: string): PCell[] => [
  label,
  String(s.shifts),
  variance(s.short),
  variance(s.excess),
  variance(s.net, true),
  variance(s.largestShort),
  String(s.shiftsShort),
];

export function attendantSummaryRows(groups: AttendantVarianceGroup[]): PRow[] {
  const all = groups.map(attendantSummary);
  const total = {
    shifts: all.reduce((a, s) => a + s.shifts, 0),
    short: sum(all, (s) => s.short),
    excess: sum(all, (s) => s.excess),
    net: sum(all, (s) => s.net),
    largestShort: all.reduce((a, s) => Math.min(a, s.largestShort), 0),
    shiftsShort: all.reduce((a, s) => a + s.shiftsShort, 0),
  };
  return [
    ...all.map((s) => ({ cells: summaryCells(s, s.attendant) })),
    { kind: 'total', cells: summaryCells(total, 'All attendants') },
  ];
}

const DETAIL_COLS: PCol[] = [
  { header: 'Date', flex: 0.9 },
  { header: 'Shift', flex: 1.3, mono: true },
  { header: 'DU', flex: 0.8 },
  { header: 'Expected (₹)', flex: 1.4, align: 'right', mono: true },
  { header: 'Declared (₹)', flex: 1.4, align: 'right', mono: true },
  { header: 'Variance (₹)', flex: 1.2, align: 'right', mono: true, strong: true },
];

/** One band per Attendant: their non-zero Drawers, then a subtotal. */
export function attendantDetailRows(groups: AttendantVarianceGroup[]): PRow[] {
  return groups.flatMap((g): PRow[] => {
    const s = attendantSummary(g);
    return [
      {
        kind: 'group',
        label: g.attendant,
        detail: `${g.lines.length} of ${g.shifts} Shifts with a variance`,
      },
      ...g.lines.map((l) => ({
        highlight: l.variance <= -400 ? ('danger' as const) : undefined,
        cells: [
          dShort(l.date),
          l.shift,
          l.du,
          amt(l.expected),
          amt(l.declared),
          variance(l.variance),
        ],
      })),
      {
        kind: 'subtotal',
        cells: [
          `${g.attendant} — short ${amtSigned(s.short)} · excess ${amtSigned(s.excess)}`,
          '',
          '',
          amt(sum(g.lines, (l) => l.expected)),
          amt(sum(g.lines, (l) => l.declared)),
          variance(s.net, true),
        ],
      },
    ];
  });
}

export const AttendantVarianceDoc = ({
  data,
  ctx,
}: {
  data: AttendantVarianceData;
  ctx: ProposalContext;
}) => {
  const f = data.filters;
  const all = data.attendants.map(attendantSummary);
  const short = sum(all, (s) => s.short);
  const excess = sum(all, (s) => s.excess);
  const shiftsShort = all.reduce((a, s) => a + s.shiftsShort, 0);
  const drawers = all.reduce((a, s) => a + s.shifts, 0);

  return (
    <ProposalDoc
      frame={{
        ...ctx,
        title: 'ATTENDANT CASH VARIANCE (SHORTAGE) REPORT',
        subtitle:
          'View-only: each Attendant’s Drawer variance at Handover, summed for the period and listed Shift by Shift. Nothing is posted or recovered.',
        filters: [
          { label: 'Period', value: f.period },
          { label: 'Attendant', value: f.attendant },
          { label: 'DU', value: f.du },
          { label: 'Non-zero only', value: f.nonZeroOnly },
        ],
        notes: [
          {
            text: 'From the Drawer Reconciliation at Handover: expected = Opening Float + DU cash sales − Cash Drops; variance = declared − expected. Attendant level only — the office count variance at Shift close is excluded (see the Shift Cash Variance report).',
          },
          {
            text: 'View-only: no shortage is posted to the ledger or recovered from an Attendant.',
          },
          {
            text: 'Reason, approved by and recovered amount are future fields (not part of group B); they are left out of this report until they exist.',
          },
        ],
      }}
      pages={[
        <React.Fragment key="p1">
          <KpiStrip
            items={[
              { l: 'Net variance', v: rs(r2(short + excess)), c: varTone(short + excess) },
              { l: 'Total short', v: rs(short), c: C.danger },
              { l: 'Total excess', v: rs(excess), c: C.amber },
              { l: 'Shifts short', v: `${shiftsShort} of ${drawers}` },
            ]}
          />
          <SectionTitle>Summary by attendant</SectionTitle>
          <PTable cols={SUMMARY_COLS} rows={attendantSummaryRows(data.attendants)} />
          <SectionTitle>Detail by attendant — Shifts with a non-zero variance only</SectionTitle>
          {data.attendants.map((g, i) => (
            <View key={g.attendant} wrap={false} style={i > 0 ? { marginTop: 8 } : {}}>
              <PTable cols={DETAIL_COLS} rows={attendantDetailRows([g])} />
            </View>
          ))}
        </React.Fragment>,
      ]}
    />
  );
};

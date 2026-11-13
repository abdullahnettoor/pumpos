import React from 'react';
import {
  C,
  Column,
  Columns,
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

/** One Drawer at Handover: what it should hold and what the Attendant handed over. */
export interface ShiftVarianceDrawer {
  attendant: string;
  du: string;
  openingFloat: number;
  /** The DU's cash sales (plus the Attendant's cash Product Sales on their first DU). */
  cashSales: number;
  cashDrops: number;
  /** Opening Float + cash sales − Cash Drops. */
  expected: number;
  declared: number;
  /** Attendant variance: declared − expected (negative = short). */
  variance: number;
}

export interface ShiftVarianceShift {
  date: string;
  label: string;
  name: string;
  drawers: ShiftVarianceDrawer[];
  /** Cash Drops at close that name no Drawer: they reduce the office's expected cash. */
  unnamedCloseDrops: number;
  /** Total declared − unnamed close drops. */
  officeExpected: number;
  officeCounted: number;
}

export interface ShiftVarianceDay {
  date: string;
  shifts: number;
  attendantVariance: number;
  officeVariance: number;
}

export interface DenominationLine {
  label: string;
  /** Null where a count does not apply (mixed coins). */
  count: number | null;
  value: number;
}

export interface ShiftCashVarianceData {
  filters: { period: string; shift: string; attendant: string; du: string; varianceOnly: string };
  /** Shifts printed Drawer by Drawer (a proposal shows the first days). */
  shifts: ShiftVarianceShift[];
  shiftsMore: number;
  month: ShiftVarianceDay[];
  shiftsWithVariance: number;
  largestShort: { amount: number; attendant: string; shift: string };
  /** Group-B denomination note count of one Shift close. */
  denominations: { shift: string; counted: number; lines: DenominationLine[] };
}

const COLS: PCol[] = [
  { header: 'Date', flex: 0.7 },
  { header: 'Shift', flex: 1.05, mono: true },
  { header: 'Attendant / DU', flex: 1.6, strong: true },
  { header: 'Opening float (₹)', flex: 1.05, align: 'right', mono: true },
  { header: 'Cash sales (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Cash drops (₹)', flex: 1.05, align: 'right', mono: true },
  { header: 'Expected (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Declared / counted (₹)', flex: 1.45, align: 'right', mono: true },
  { header: 'Variance (₹)', flex: 1.1, align: 'right', mono: true },
  { header: 'Remarks', flex: 2.5 },
];

const variance = (n: number, bold = false): PCell => ({
  text: amtSigned(n),
  color: varTone(n),
  bold,
});
const r2 = (n: number) => Math.round(n * 100) / 100;
const officeVariance = (s: ShiftVarianceShift) => r2(s.officeCounted - s.officeExpected);

const drawerRemark = (n: number) =>
  n < 0 ? 'Short at Handover' : n > 0 ? 'Excess at Handover' : 'Tallied';

/** One Shift: a row per Drawer (Handover), then the Office row (shift close). */
export function shiftVarianceRows(s: ShiftVarianceShift): PRow[] {
  const rows: PRow[] = s.drawers.map((d) => ({
    highlight: d.variance <= -400 ? ('danger' as const) : undefined,
    cells: [
      dShort(s.date),
      s.label,
      { text: `${d.attendant} · ${d.du}` },
      amt(d.openingFloat),
      amt(d.cashSales),
      d.cashDrops ? amt(d.cashDrops) : '',
      amt(d.expected),
      amt(d.declared),
      variance(d.variance),
      drawerRemark(d.variance),
    ],
  }));
  const ov = officeVariance(s);
  rows.push({
    cells: [
      dShort(s.date),
      s.label,
      { text: 'Office count', color: C.green },
      '',
      '',
      s.unnamedCloseDrops ? amt(s.unnamedCloseDrops) : '',
      { text: amt(s.officeExpected), bold: true },
      { text: amt(s.officeCounted), bold: true },
      variance(ov, true),
      ov === 0 ? 'Counted = declared total' : 'Office count variance',
    ],
  });
  return rows;
}

/** A day's Shifts and its total: Drawer figures summed, both variance levels netted. */
export function shiftVarianceDayRows(day: ShiftVarianceShift[]): PRow[] {
  const drawers = day.flatMap((s) => s.drawers);
  const attendant = sum(drawers, (d) => d.variance);
  const office = sum(day, officeVariance);
  return [
    ...day.flatMap(shiftVarianceRows),
    {
      kind: 'subtotal',
      cells: [
        `${dShort(day[0].date)} day total`,
        '',
        '',
        amt(sum(drawers, (d) => d.openingFloat)),
        amt(sum(drawers, (d) => d.cashSales)),
        amt(sum(drawers, (d) => d.cashDrops)),
        amt(sum(drawers, (d) => d.expected)),
        amt(sum(drawers, (d) => d.declared)),
        variance(r2(attendant + office), true),
        `Attendant ${amtSigned(attendant)} · Office ${amtSigned(office)}`,
      ],
    },
  ];
}

const MONTH_COLS: PCol[] = [
  { header: 'Date', flex: 0.9 },
  { header: 'Shifts', flex: 0.6, align: 'right', mono: true },
  { header: 'Attendant (₹)', flex: 1.2, align: 'right', mono: true },
  { header: 'Office (₹)', flex: 1.1, align: 'right', mono: true },
  { header: 'Total (₹)', flex: 1.1, align: 'right', mono: true, strong: true },
];

const monthRows = (days: ShiftVarianceDay[]): PRow[] =>
  days.map((d) => ({
    cells: [
      dShort(d.date),
      String(d.shifts),
      variance(d.attendantVariance),
      variance(d.officeVariance),
      variance(r2(d.attendantVariance + d.officeVariance), true),
    ],
  }));

const DENOM_COLS: PCol[] = [
  { header: 'Denomination', flex: 1.4, proposed: true },
  { header: 'Count', flex: 0.8, align: 'right', mono: true, proposed: true },
  { header: 'Value (₹)', flex: 1.3, align: 'right', mono: true, proposed: true },
];

export const ShiftCashVarianceDoc = ({
  data,
  ctx,
}: {
  data: ShiftCashVarianceData;
  ctx: ProposalContext;
}) => {
  const f = data.filters;
  const attendant = sum(data.month, (d) => d.attendantVariance);
  const office = sum(data.month, (d) => d.officeVariance);
  const shiftCount = data.month.reduce((a, d) => a + d.shifts, 0);
  const dates = [...new Set(data.shifts.map((s) => s.date))];
  const half = Math.ceil(data.month.length / 2);
  const den = data.denominations;

  return (
    <ProposalDoc
      orientation="landscape"
      frame={{
        ...ctx,
        title: 'SHIFT CASH VARIANCE REPORT',
        subtitle:
          'Each Shift’s cash, Drawer by Drawer at Handover (attendant variance), then the office count at close (office count variance).',
        filters: [
          { label: 'Period', value: f.period },
          { label: 'Shift', value: f.shift },
          { label: 'Attendant', value: f.attendant },
          { label: 'DU', value: f.du },
          { label: 'Variance only', value: f.varianceOnly },
        ],
        notes: [
          {
            text: 'Attendant level, per Drawer at Handover: expected = Opening Float + DU cash sales − Cash Drops; variance = declared − expected. Office level, at Shift close: expected = total declared − Cash Drops that name no Drawer; variance = counted − expected.',
          },
          {
            text: 'The two levels are separate (#287): an attendant variance never repeats in the office count. Card, UPI, credit and OMC card sales never enter either.',
          },
          {
            text: 'View-only: attendant shortages are not posted to the ledger. Only cash the office received reaches Cash in Hand (see the Cash Book).',
          },
          {
            text: 'Denomination count at Handover / Shift close (marked *).',
            needs: 'save the denomination note count at Handover and close, group B',
          },
        ],
      }}
      pages={[
        <React.Fragment key="detail">
          <KpiStrip
            items={[
              { l: 'Attendant variance (net)', v: rs(attendant), c: varTone(attendant) },
              { l: 'Office variance (net)', v: rs(office), c: varTone(office) },
              { l: 'Shifts with a variance', v: `${data.shiftsWithVariance} of ${shiftCount}` },
              {
                l: `Largest short · ${data.largestShort.attendant}`,
                v: rs(data.largestShort.amount),
                c: C.danger,
              },
            ]}
          />
          <SectionTitle>{`Shift detail — ${dShort(dates[0])} to ${dShort(dates[dates.length - 1])}`}</SectionTitle>
          <PTable
            cols={COLS}
            rows={[
              ...dates.flatMap((d) =>
                shiftVarianceDayRows(data.shifts.filter((s) => s.date === d)),
              ),
              {
                kind: 'subtotal',
                cells: [
                  `Shown: ${data.shifts.length} Shifts · ${data.shiftsMore} more Shifts in the full report`,
                  ...Array.from({ length: 9 }, () => ''),
                ],
              },
            ]}
          />
        </React.Fragment>,
        <React.Fragment key="month">
          <Columns>
            <Column flex={1}>
              <SectionTitle>{`Month summary — ${f.period}`}</SectionTitle>
              <PTable cols={MONTH_COLS} rows={monthRows(data.month.slice(0, half))} />
            </Column>
            <Column flex={1}>
              <SectionTitle> </SectionTitle>
              <PTable
                cols={MONTH_COLS}
                rows={[
                  ...monthRows(data.month.slice(half)),
                  {
                    kind: 'total',
                    cells: [
                      'Month',
                      String(shiftCount),
                      variance(attendant),
                      variance(office),
                      variance(r2(attendant + office), true),
                    ],
                  },
                ]}
              />
            </Column>
            <Column flex={0.8}>
              <SectionTitle tag="proposed">Denomination count</SectionTitle>
              <PTable
                cols={DENOM_COLS}
                rows={[
                  { kind: 'group', label: `Shift ${den.shift}`, detail: 'office count at close' },
                  ...den.lines.map((l) => ({
                    cells: [l.label, l.count === null ? '—' : String(l.count), amt(l.value)],
                  })),
                  { kind: 'total', cells: ['Counted', '', amt(sum(den.lines, (l) => l.value))] },
                ]}
              />
            </Column>
          </Columns>
        </React.Fragment>,
      ]}
    />
  );
};

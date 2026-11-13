import React from 'react';
import {
  C,
  KpiStrip,
  PTable,
  ProposalDoc,
  SectionTitle,
  amtSigned,
  dShort,
  num,
  numSigned,
  pct,
  qty,
  rs0,
  type PCol,
  type PRow,
  type ProposalContext,
} from './shared.js';

/** One Tank on one Business Day: book figures from the DSR, the closing from its Tank Dip. */
export interface TankDayLine {
  date: string;
  tank: string;
  fuel: string;
  /** The previous day's dip closing (the physical figure carries forward). */
  openingBook: number;
  /** Measured Decantation receipts (Tank Lines) that day. */
  receipts: number;
  /** Litres dispensed from the Tank's nozzles: Σ (closing − opening − testing). */
  sales: number;
  bookClosing: number;
  dipClosing: number;
}

export interface TankMeta {
  tank: string;
  fuel: string;
  capacity: number;
  /** Current cost price per litre (VAT inclusive), to value the Variance. */
  costPrice: number;
}

export interface TankVariationData {
  filters: { period: string; tank: string; fuel: string };
  /** Variance tolerance, % of litres sold (app-wide today). */
  limitPct: number;
  tanks: TankMeta[];
  days: TankDayLine[];
  /** The Tank printed day by day in this copy; the others print as their month line. */
  detailTank: string;
}

/** Variance in litres: dip − book (a gain is positive, a loss negative). */
export const varianceL = (d: TankDayLine) => Math.round((d.dipClosing - d.bookClosing) * 100) / 100;
/** Variance as a % of the litres sold that day (a Tank that sold nothing tolerates none). */
export const variancePct = (d: TankDayLine) =>
  d.sales > 0 ? (varianceL(d) / d.sales) * 100 : varianceL(d) === 0 ? 0 : Infinity;
export const overLimit = (d: TankDayLine, limitPct: number) => Math.abs(variancePct(d)) > limitPct;

export interface TankMonth {
  meta: TankMeta;
  opening: number;
  receipts: number;
  loads: number;
  sales: number;
  /** Month book closing: opening + receipts − sales. */
  bookClosing: number;
  /** Last day's dip. */
  dipClosing: number;
  gainL: number;
  lossL: number;
  netL: number;
  netValue: number;
  daysOver: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function tankMonths(data: TankVariationData): TankMonth[] {
  return data.tanks.map((meta) => {
    const ds = data.days.filter((d) => d.tank === meta.tank);
    const vs = ds.map(varianceL);
    const receipts = r2(ds.reduce((a, d) => a + d.receipts, 0));
    const sales = r2(ds.reduce((a, d) => a + d.sales, 0));
    const opening = ds[0].openingBook;
    const netL = r2(vs.reduce((a, v) => a + v, 0));
    return {
      meta,
      opening,
      receipts,
      loads: ds.filter((d) => d.receipts > 0).length,
      sales,
      bookClosing: r2(opening + receipts - sales),
      dipClosing: ds[ds.length - 1].dipClosing,
      gainL: r2(vs.filter((v) => v > 0).reduce((a, v) => a + v, 0)),
      lossL: r2(vs.filter((v) => v < 0).reduce((a, v) => a + v, 0)),
      netL,
      netValue: r2(netL * meta.costPrice),
      daysOver: ds.filter((d) => overLimit(d, data.limitPct)).length,
    };
  });
}

const tone = (n: number) => (n < 0 ? C.danger : n > 0 ? C.amber : undefined);

const REG_COLS: PCol[] = [
  { header: 'Date', flex: 0.8 },
  { header: 'Tank', flex: 0.5, strong: true },
  { header: 'Fuel', flex: 0.9 },
  { header: 'Opening book (L)', flex: 1.3, align: 'right', mono: true },
  { header: 'Receipts (L)', flex: 1.1, align: 'right', mono: true },
  { header: 'Sales (L)', flex: 1.1, align: 'right', mono: true },
  { header: 'Book closing (L)', flex: 1.3, align: 'right', mono: true },
  { header: 'Dip closing (L)', flex: 1.2, align: 'right', mono: true, strong: true },
  { header: 'Variance (L)', flex: 1, align: 'right', mono: true },
  { header: 'Var. % of sales', flex: 0.9, align: 'right', mono: true },
  { header: 'Flag', flex: 0.9 },
];

const dayRow = (d: TankDayLine, limitPct: number): PRow => {
  const v = varianceL(d);
  const over = overLimit(d, limitPct);
  return {
    highlight: over ? (v < 0 ? 'danger' : 'warn') : undefined,
    cells: [
      dShort(d.date),
      d.tank,
      d.fuel,
      num(d.openingBook),
      d.receipts ? num(d.receipts) : '',
      num(d.sales),
      num(d.bookClosing),
      num(d.dipClosing),
      { text: numSigned(v), color: tone(v) },
      { text: pct(variancePct(d), 2, true), color: over ? tone(v) : undefined },
      over ? { text: `Over ${pct(limitPct)}`, color: v < 0 ? C.danger : C.amber, bold: true } : '',
    ],
  };
};

const monthRow = (m: TankMonth, label: string): PRow => ({
  kind: 'subtotal',
  cells: [
    label,
    '',
    '',
    num(m.opening),
    num(m.receipts),
    num(m.sales),
    num(m.bookClosing),
    num(m.dipClosing),
    { text: numSigned(m.netL), color: tone(m.netL) },
    pct((m.netL / m.sales) * 100, 2, true),
    m.daysOver ? `${m.daysOver} day${m.daysOver > 1 ? 's' : ''}` : '',
  ],
});

/** The daily register: the detail Tank day by day, every other Tank as its month line. */
export function registerRows(data: TankVariationData, months: TankMonth[]): PRow[] {
  const rows: PRow[] = [];
  for (const m of months) {
    const ds = data.days.filter((d) => d.tank === m.meta.tank);
    rows.push({
      kind: 'group',
      label: `${m.meta.tank} · ${m.meta.fuel}`,
      detail: `capacity ${qty(m.meta.capacity, 'L', 0)} · ${m.loads} receipts`,
    });
    if (m.meta.tank === data.detailTank) {
      rows.push(...ds.map((d) => dayRow(d, data.limitPct)));
      rows.push(monthRow(m, `${m.meta.tank} month (${ds.length} days)`));
    } else {
      rows.push(monthRow(m, `${m.meta.tank} month · ${ds.length} daily rows in the full report`));
    }
  }
  return rows;
}

const SUM_COLS: PCol[] = [
  { header: 'Tank', flex: 0.5, strong: true },
  { header: 'Fuel', flex: 0.9 },
  { header: 'Opening (L)', flex: 1.1, align: 'right', mono: true },
  { header: 'Receipts (L)', flex: 1.1, align: 'right', mono: true },
  { header: 'Sales (L)', flex: 1.1, align: 'right', mono: true },
  { header: 'Book closing (L)', flex: 1.2, align: 'right', mono: true },
  { header: 'Dip closing (L)', flex: 1.1, align: 'right', mono: true },
  { header: 'Gain (L)', flex: 0.8, align: 'right', mono: true },
  { header: 'Loss (L)', flex: 0.8, align: 'right', mono: true },
  { header: 'Net var. (L)', flex: 0.9, align: 'right', mono: true },
  { header: '% of sales', flex: 0.8, align: 'right', mono: true },
  { header: 'Cost (₹/L)', flex: 0.8, align: 'right', mono: true },
  { header: 'Net var. (₹)', flex: 1.1, align: 'right', mono: true, strong: true },
  { header: 'Days over', flex: 0.7, align: 'right', mono: true },
];

function summaryRows(months: TankMonth[]): PRow[] {
  const total = (f: (m: TankMonth) => number) => r2(months.reduce((a, m) => a + f(m), 0));
  const net = total((m) => m.netL);
  const value = total((m) => m.netValue);
  return [
    ...months.map((m) => ({
      cells: [
        m.meta.tank,
        m.meta.fuel,
        num(m.opening),
        num(m.receipts),
        num(m.sales),
        num(m.bookClosing),
        num(m.dipClosing),
        numSigned(m.gainL),
        num(m.lossL),
        { text: numSigned(m.netL), color: tone(m.netL) },
        pct((m.netL / m.sales) * 100, 2, true),
        num(m.meta.costPrice),
        { text: amtSigned(m.netValue), color: tone(m.netValue) },
        String(m.daysOver),
      ],
    })),
    {
      kind: 'total' as const,
      cells: [
        'All tanks',
        '',
        num(total((m) => m.opening)),
        num(total((m) => m.receipts)),
        num(total((m) => m.sales)),
        num(total((m) => m.bookClosing)),
        num(total((m) => m.dipClosing)),
        numSigned(total((m) => m.gainL)),
        num(total((m) => m.lossL)),
        { text: numSigned(net), color: tone(net) },
        pct((net / total((m) => m.sales)) * 100, 2, true),
        '',
        { text: amtSigned(value), color: tone(value) },
        String(months.reduce((a, m) => a + m.daysOver, 0)),
      ],
    },
  ];
}

export const TankVariationDoc = ({
  data,
  ctx,
}: {
  data: TankVariationData;
  ctx: ProposalContext;
}) => {
  const f = data.filters;
  const months = tankMonths(data);
  const gain = r2(months.reduce((a, m) => a + m.gainL, 0));
  const loss = r2(months.reduce((a, m) => a + m.lossL, 0));
  const netValue = r2(months.reduce((a, m) => a + m.netValue, 0));
  const daysOver = months.reduce((a, m) => a + m.daysOver, 0);
  const exceptions = data.days
    .filter((d) => overLimit(d, data.limitPct))
    .sort((a, b) => a.date.localeCompare(b.date) || a.tank.localeCompare(b.tank));

  return (
    <ProposalDoc
      orientation="landscape"
      frame={{
        ...ctx,
        title: 'FUEL TANK STOCK & VARIATION REGISTER',
        subtitle: `Per tank, per day: book stock against the closing dip, and the Variance judged against ${pct(data.limitPct)} of the litres sold.`,
        filters: [
          { label: 'Period', value: f.period },
          { label: 'Tank', value: f.tank },
          { label: 'Fuel', value: f.fuel },
          { label: 'Limit', value: `${pct(data.limitPct)} of sales`, proposed: true },
        ],
        notes: [
          {
            text: 'Book figures come from the frozen DSR tank movement of each sealed Business Day (receipts = measured Decantation Tank Lines; sales = nozzle litres net of testing); Dip closing is that day’s closing Tank Dip.',
          },
          {
            text: 'Assumption: each day’s Opening book is the previous day’s Dip closing, so a Variance is booked once and never carries forward. Month Book closing = Opening + Receipts − Sales; net Variance = Dip closing − Book closing.',
          },
          {
            text: `Variance = dip − book (gain positive, loss negative), valued at the current cost price. A day is flagged when |Variance| exceeds ${pct(data.limitPct)} of litres sold (a Tank that sold nothing tolerates none); the limit is one app-wide value today (stock-variance.ts).`,
          },
          {
            text: 'Limit filter (marked *): a per-station Variance limit.',
            needs: 'per-station Variance limit setting, group B',
          },
        ],
      }}
      pages={[
        <React.Fragment key="p1">
          <KpiStrip
            items={[
              { l: 'Total gain', v: qty(gain, 'L'), c: C.amber },
              { l: 'Total loss', v: qty(loss, 'L'), c: C.danger },
              { l: 'Net variance (L)', v: qty(r2(gain + loss), 'L', 2), c: tone(gain + loss) },
              { l: 'Net variance at cost', v: rs0(netValue), c: tone(netValue) },
              {
                l: `Days over ${pct(data.limitPct)}`,
                v: String(daysOver),
                c: daysOver ? C.danger : C.success,
              },
            ]}
          />
          <SectionTitle>Per-tank summary — Oct 2026</SectionTitle>
          <PTable cols={SUM_COLS} rows={summaryRows(months)} />
          <SectionTitle>{`Days over the ${pct(data.limitPct)} limit — all tanks`}</SectionTitle>
          <PTable
            cols={REG_COLS}
            rows={[
              ...exceptions.map((d) => dayRow(d, data.limitPct)),
              {
                kind: 'subtotal',
                cells: [
                  `${exceptions.length} days over the limit`,
                  ...Array.from({ length: 7 }, () => ''),
                  {
                    text: numSigned(r2(exceptions.reduce((a, d) => a + varianceL(d), 0))),
                    color: tone(exceptions.reduce((a, d) => a + varianceL(d), 0)),
                  },
                  '',
                  '',
                ],
              },
            ]}
          />
        </React.Fragment>,
        <React.Fragment key="p2">
          <SectionTitle>{`Daily register — ${data.detailTank} in full`}</SectionTitle>
          <PTable cols={REG_COLS} rows={registerRows(data, months)} />
        </React.Fragment>,
      ]}
    />
  );
};

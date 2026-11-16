import React from 'react';
import {
  C,
  KpiStrip,
  PTable,
  ProposalDoc,
  SectionTitle,
  amt,
  amtSigned,
  pct,
  rs0,
  type PCell,
  type PCol,
  type PRow,
  type ProposalContext,
} from './shared.js';

/** One P&L line in both periods; `detail` prints small under the label (quantity sold). */
export interface PLLine {
  label: string;
  detail?: string;
  now: number;
  prev: number;
}

export interface ProfitLossData {
  filters: { period: string; compare: string; station: string };
  periods: { now: string; prev: string };
  revenue: { fuel: PLLine[]; products: PLLine[] };
  costOfSales: { fuel: PLLine[]; products: PLLine[] };
  /** Income Office Records by head, net of GST. */
  otherIncome: PLLine[];
  /** Expenses by head, split by the group-B Direct / Indirect flag. */
  directExpenses: PLLine[];
  indirectExpenses: PLLine[];
}

type Sense = 'in' | 'out';

const r2 = (n: number) => Math.round(n * 100) / 100;
const total = (label: string, xs: PLLine[]): PLLine => ({
  label,
  now: r2(xs.reduce((a, x) => a + x.now, 0)),
  prev: r2(xs.reduce((a, x) => a + x.prev, 0)),
});
const combine = (label: string, plus: PLLine[], minus: PLLine[] = []): PLLine => {
  const p = total(label, plus);
  const m = total(label, minus);
  return { label, now: r2(p.now - m.now), prev: r2(p.prev - m.prev) };
};

/** Change ink on revenue, income and profit lines: green up, red down. Cost lines stay plain (they follow volume). */
const changeCells = (l: PLLine, sense: Sense): PCell[] => {
  const d = r2(l.now - l.prev);
  const color = sense === 'out' || Math.abs(d) < 0.005 ? undefined : d > 0 ? C.success : C.danger;
  return [
    { text: amtSigned(d), color },
    { text: l.prev ? pct((d / Math.abs(l.prev)) * 100, 1, true) : '—', color },
  ];
};

const cells = (l: PLLine, sense: Sense): PCell[] => [
  { text: l.label, detail: l.detail },
  amt(l.now),
  amt(l.prev),
  ...changeCells(l, sense),
];

const line = (l: PLLine, sense: Sense): PRow => ({ cells: cells(l, sense) });
const subtotal = (l: PLLine, sense: Sense): PRow => ({ kind: 'subtotal', cells: cells(l, sense) });
const grand = (l: PLLine, sense: Sense): PRow => ({ kind: 'total', cells: cells(l, sense) });
/** A margin row: the ratio in each period and its change in points. */
const margin = (label: string, num: PLLine, den: PLLine): PRow => {
  const now = (num.now / den.now) * 100;
  const prev = (num.prev / den.prev) * 100;
  const d = now - prev;
  return {
    highlight: 'muted',
    cells: [
      label,
      pct(now, 2),
      pct(prev, 2),
      { text: `${pct(d, 2, true).replace('%', '')} pts`, color: d >= 0 ? C.success : C.danger },
      '',
    ],
  };
};

export function profitLossTotals(d: ProfitLossData) {
  const fuelRev = total('Fuel sales', d.revenue.fuel);
  const prodRev = total('Product sales', d.revenue.products);
  const revenue = total('Total revenue', [fuelRev, prodRev]);
  const fuelCost = total('Fuel cost of sales', d.costOfSales.fuel);
  const prodCost = total('Product cost of sales', d.costOfSales.products);
  const cost = total('Total cost of sales', [fuelCost, prodCost]);
  const gross = combine('Gross profit', [revenue], [cost]);
  const income = total('Total other income', d.otherIncome);
  const direct = total('Direct expenses', d.directExpenses);
  const indirect = total('Indirect expenses', d.indirectExpenses);
  const expenses = total('Total expenses', [direct, indirect]);
  const net = combine('Net profit', [gross, income], [expenses]);
  return {
    fuelRev,
    prodRev,
    revenue,
    fuelCost,
    prodCost,
    cost,
    gross,
    income,
    direct,
    indirect,
    expenses,
    net,
  };
}

/** Trading section: revenue, cost of sales, gross profit. */
export function tradingRows(d: ProfitLossData): PRow[] {
  const t = profitLossTotals(d);
  return [
    {
      kind: 'group',
      label: 'Revenue',
      detail: 'fuel at pump price (VAT incl.) · products net of GST',
    },
    ...d.revenue.fuel.map((l) => line(l, 'in')),
    subtotal(t.fuelRev, 'in'),
    ...d.revenue.products.map((l) => line(l, 'in')),
    subtotal(t.prodRev, 'in'),
    grand(t.revenue, 'in'),
    {
      kind: 'group',
      label: 'Cost of sales',
      detail: 'quantity sold × cost price frozen at day close',
    },
    ...d.costOfSales.fuel.map((l) => line(l, 'out')),
    subtotal(t.fuelCost, 'out'),
    ...d.costOfSales.products.map((l) => line(l, 'out')),
    subtotal(t.prodCost, 'out'),
    grand(t.cost, 'out'),
    grand(t.gross, 'in'),
    margin('Gross margin %', t.gross, t.revenue),
  ];
}

/** From gross profit to net profit: other income, Direct and Indirect expenses. */
export function profitLossRows(d: ProfitLossData): PRow[] {
  const t = profitLossTotals(d);
  return [
    { kind: 'lead', cells: cells({ ...t.gross, label: 'Gross profit (from trading)' }, 'in') },
    { kind: 'group', label: 'Other income', detail: 'Income records by head, net of GST' },
    ...d.otherIncome.map((l) => line(l, 'in')),
    subtotal(t.income, 'in'),
    { kind: 'group', label: 'Direct expenses*', detail: 'by head' },
    ...d.directExpenses.map((l) => line(l, 'out')),
    subtotal(t.direct, 'out'),
    { kind: 'group', label: 'Indirect expenses*', detail: 'by head' },
    ...d.indirectExpenses.map((l) => line(l, 'out')),
    subtotal(t.indirect, 'out'),
    grand(t.expenses, 'out'),
    grand(t.net, 'in'),
    margin('Net profit % (of revenue)', t.net, t.revenue),
  ];
}

export const ProfitLossDoc = ({ data, ctx }: { data: ProfitLossData; ctx: ProposalContext }) => {
  const f = data.filters;
  const p = data.periods;
  const t = profitLossTotals(data);
  const cols: PCol[] = [
    { header: 'Particulars', flex: 3.2 },
    { header: `${p.now} (₹)`, flex: 1.5, align: 'right', mono: true, strong: true },
    { header: `${p.prev} (₹)`, flex: 1.5, align: 'right', mono: true },
    { header: 'Change (₹)', flex: 1.4, align: 'right', mono: true },
    { header: 'Change %', flex: 0.9, align: 'right', mono: true },
  ];
  const vs = (l: PLLine) => {
    const d = l.now - l.prev;
    return { v: pct((d / Math.abs(l.prev)) * 100, 1, true), c: d >= 0 ? C.success : C.danger };
  };

  return (
    <ProposalDoc
      frame={{
        ...ctx,
        title: 'PROFIT & LOSS',
        subtitle:
          'What the station earned in the period after the cost of what it sold and its running costs, against the previous period.',
        filters: [
          { label: 'Period', value: f.period },
          { label: 'Compare with previous period', value: f.compare },
          { label: 'Station', value: f.station },
        ],
        notes: [
          {
            text: 'Revenue comes from sealed DSRs: fuel at pump price from nozzle readings, Product Sales net of GST (GST is a pass-through set off in GSTR-3B).',
          },
          {
            text: 'Cost of sales = quantity sold × the cost price frozen at day close (margin method), not opening + purchases − closing stock. Fuel cost is the dealer price incl. VAT, so VAT sits in both revenue and cost and the fuel margin is unaffected. Tank variance is not in this P&L.',
          },
          {
            text: 'Other income and expenses are Office Records by Entry Date. The previous-period column is built the same way from its own DSRs and records.',
          },
          {
            text: 'Direct / Indirect expense sections (marked *).',
            needs: 'Direct / Indirect flag on expense heads, group B',
          },
        ],
      }}
      pages={[
        <React.Fragment key="p1">
          <KpiStrip
            items={[
              { l: 'Revenue', v: rs0(t.revenue.now) },
              { l: 'Gross profit', v: rs0(t.gross.now) },
              { l: 'Net profit', v: rs0(t.net.now), c: t.net.now < 0 ? C.danger : undefined },
              { l: 'Net margin', v: pct((t.net.now / t.revenue.now) * 100, 2) },
              { l: `Net profit vs ${p.prev}`, ...vs(t.net) },
            ]}
          />
          <SectionTitle>Trading — revenue, cost of sales, gross profit</SectionTitle>
          <PTable cols={cols} rows={tradingRows(data)} />
        </React.Fragment>,
        <React.Fragment key="p2">
          <SectionTitle>Gross profit to net profit</SectionTitle>
          <PTable cols={cols} rows={profitLossRows(data)} />
        </React.Fragment>,
      ]}
    />
  );
};

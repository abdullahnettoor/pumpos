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
  dShort,
  num,
  pct,
  qty,
  rs0,
  type PCol,
  type PRow,
  type ProposalContext,
} from './shared.js';

/** One product's line for the period. Fuel carries VAT; products carry GST. */
export interface ProductSalesLine {
  product: string;
  /** Group-B product category pick-list. */
  category: string;
  type: 'Fuel' | 'Product';
  unit: string;
  qty: number;
  avgRate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  vat: number;
  total: number;
}

/** One nozzle's sale in one Shift: the meter pair it derives from. */
export interface FuelDetailLine {
  date: string;
  nozzle: string;
  du: string;
  product: string;
  shift: string;
  attendant: string;
  opening: number;
  closing: number;
  testing: number;
  netL: number;
  rate: number;
  value: number;
}

export interface DailySalesTotal {
  date: string;
  fuelL: number;
  fuelValue: number;
  productValue: number;
}

export interface ProductSalesData {
  filters: {
    period: string;
    category: string;
    product: string;
    shift: string;
    nozzle: string;
    attendant: string;
  };
  lines: ProductSalesLine[];
  fuelDetail: FuelDetailLine[];
  /** Rows the detail has beyond those printed (a proposal shows the first days). */
  fuelDetailMore: number;
  daily: DailySalesTotal[];
  previous: { label: string; total: number; fuelL: number; productValue: number };
}

const COLS: PCol[] = [
  { header: 'Product', flex: 2.6, strong: true },
  { header: 'Category', flex: 1.2, proposed: true },
  { header: 'Type', flex: 0.8 },
  { header: 'Qty', flex: 1.3, align: 'right', mono: true },
  { header: 'Avg rate (₹)', flex: 1, align: 'right', mono: true },
  { header: 'Taxable (₹)', flex: 1.5, align: 'right', mono: true },
  { header: 'CGST (₹)', flex: 1.1, align: 'right', mono: true },
  { header: 'SGST (₹)', flex: 1.1, align: 'right', mono: true },
  { header: 'IGST (₹)', flex: 0.8, align: 'right', mono: true },
  { header: 'VAT (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Total (₹)', flex: 1.5, align: 'right', mono: true, strong: true },
];

type Totals = Pick<ProductSalesLine, 'taxable' | 'cgst' | 'sgst' | 'igst' | 'vat' | 'total'>;
const add = (xs: Totals[]): Totals => {
  const t = { taxable: 0, cgst: 0, sgst: 0, igst: 0, vat: 0, total: 0 };
  for (const x of xs) for (const k of Object.keys(t) as (keyof Totals)[]) t[k] += x[k];
  return t;
};
/** Totals cells; a tax the group cannot carry (GST on fuel, VAT on products) prints blank. */
const money = (t: Totals, gst = true, vat = true) => [
  amt(t.taxable),
  gst ? amt(t.cgst) : '',
  gst ? amt(t.sgst) : '',
  gst ? amt(t.igst) : '',
  vat ? amt(t.vat) : '',
  amt(t.total),
];
const blank = (n: number) => Array.from({ length: n }, () => '');

/** The product-wise table: Fuel, then Product by category, each with a subtotal. */
export function productSalesRows(lines: ProductSalesLine[]): PRow[] {
  const rows: PRow[] = [];
  const line = (l: ProductSalesLine): PRow => ({
    cells: [
      l.product,
      l.category,
      l.type,
      qty(l.qty, l.unit),
      num(l.avgRate),
      amt(l.taxable),
      l.type === 'Fuel' ? '' : amt(l.cgst),
      l.type === 'Fuel' ? '' : amt(l.sgst),
      l.type === 'Fuel' ? '' : amt(l.igst),
      l.type === 'Fuel' ? amt(l.vat) : '',
      amt(l.total),
    ],
  });
  const fuel = lines.filter((l) => l.type === 'Fuel');
  const products = lines.filter((l) => l.type === 'Product');
  rows.push({ kind: 'group', label: 'Fuel', detail: 'VAT, outside GST' });
  rows.push(...fuel.map(line));
  const fuelL = fuel.reduce((a, l) => a + l.qty, 0);
  rows.push({
    kind: 'subtotal',
    cells: ['Fuel total', '', '', qty(fuelL, 'L'), '', ...money(add(fuel), false, true)],
  });
  const categories = [...new Set(products.map((l) => l.category))];
  for (const cat of categories) {
    const inCat = products.filter((l) => l.category === cat);
    rows.push({ kind: 'group', label: `Product · ${cat}`, detail: 'GST' });
    rows.push(...inCat.map(line));
    const units = inCat.reduce((a, l) => a + l.qty, 0);
    rows.push({
      kind: 'subtotal',
      cells: [`${cat} subtotal`, '', '', qty(units, 'Nos'), '', ...money(add(inCat), true, false)],
    });
  }
  rows.push({
    kind: 'subtotal',
    cells: ['Product total', ...blank(4), ...money(add(products), true, false)],
  });
  rows.push({ kind: 'total', cells: ['Grand total', ...blank(4), ...money(add(lines))] });
  return rows;
}

const DETAIL_COLS: PCol[] = [
  { header: 'Date', flex: 0.8 },
  { header: 'Nozzle', flex: 0.6, strong: true },
  { header: 'DU', flex: 0.6 },
  { header: 'Product', flex: 1.1 },
  { header: 'Shift', flex: 1.1, mono: true },
  { header: 'Attendant', flex: 1.2 },
  { header: 'Opening', flex: 1.3, align: 'right', mono: true },
  { header: 'Closing', flex: 1.3, align: 'right', mono: true },
  { header: 'Testing L', flex: 0.8, align: 'right', mono: true },
  { header: 'Net L', flex: 1, align: 'right', mono: true },
  { header: 'Rate (₹)', flex: 0.9, align: 'right', mono: true },
  { header: 'Value (₹)', flex: 1.3, align: 'right', mono: true, strong: true },
];

const TREND_COLS: PCol[] = [
  { header: 'Date', flex: 0.8 },
  { header: 'Fuel L', flex: 1.1, align: 'right', mono: true },
  { header: 'Fuel (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Product (₹)', flex: 1.1, align: 'right', mono: true },
  { header: 'Total (₹)', flex: 1.3, align: 'right', mono: true, strong: true },
];

const trendRows = (days: DailySalesTotal[]): PRow[] =>
  days.map((d) => ({
    cells: [
      dShort(d.date),
      num(d.fuelL),
      amt(d.fuelValue),
      amt(d.productValue),
      amt(d.fuelValue + d.productValue),
    ],
  }));

export const ProductSalesDoc = ({
  data,
  ctx,
}: {
  data: ProductSalesData;
  ctx: ProposalContext;
}) => {
  const f = data.filters;
  const grand = data.lines.reduce((a, l) => a + l.total, 0);
  const fuelL = data.lines.filter((l) => l.type === 'Fuel').reduce((a, l) => a + l.qty, 0);
  const productValue = data.lines
    .filter((l) => l.type === 'Product')
    .reduce((a, l) => a + l.total, 0);
  const change = (now: number, before: number) => ((now - before) / before) * 100;
  const tone = (n: number) => (n < 0 ? C.danger : C.success);
  const half = Math.ceil(data.daily.length / 2);
  const detailTotal = data.fuelDetail.reduce((a, d) => a + d.value, 0);
  const detailL = data.fuelDetail.reduce((a, d) => a + d.netL, 0);

  return (
    <ProposalDoc
      orientation="landscape"
      frame={{
        ...ctx,
        title: 'PRODUCT-WISE SALES REPORT',
        subtitle:
          'What sold, how much, at what rate and tax, by product and category; fuel traced to nozzle, shift and attendant.',
        filters: [
          { label: 'Period', value: f.period },
          { label: 'Category', value: f.category, proposed: true },
          { label: 'Product', value: f.product },
          { label: 'Shift', value: f.shift },
          { label: 'Nozzle', value: f.nozzle },
          { label: 'Attendant', value: f.attendant },
        ],
        notes: [
          {
            text: 'Fuel quantity and value come from Nozzle Readings (closing − opening − testing) in closed Shift Summaries / sealed DSRs; an open day prints as a preview.',
          },
          {
            text: 'Product lines come from sale_items of Billed and Handover Product Sales. GST is split as frozen on the sale; fuel VAT is shown in its own column and never added to GST.',
          },
          {
            text: '“vs previous period” compares with the same span immediately before (Sep 2026).',
          },
          {
            text: 'Category column, category subtotals and the Category filter (marked *).',
            needs: 'product category pick-list, group B',
          },
        ],
      }}
      pages={[
        <React.Fragment key="p1">
          <KpiStrip
            items={[
              { l: 'Total sales', v: rs0(grand) },
              {
                l: `vs ${data.previous.label}`,
                v: pct(change(grand, data.previous.total), 1, true),
                c: tone(grand - data.previous.total),
              },
              { l: 'Fuel volume', v: qty(fuelL, 'L', 0) },
              {
                l: `Fuel L vs ${data.previous.label}`,
                v: pct(change(fuelL, data.previous.fuelL), 1, true),
                c: tone(fuelL - data.previous.fuelL),
              },
              { l: 'Product sales', v: rs0(productValue) },
              {
                l: `Products vs ${data.previous.label}`,
                v: pct(change(productValue, data.previous.productValue), 1, true),
                c: tone(productValue - data.previous.productValue),
              },
            ]}
          />
          <SectionTitle>Product-wise summary</SectionTitle>
          <PTable cols={COLS} rows={productSalesRows(data.lines)} />
          <SectionTitle>Fuel detail — nozzle › shift › attendant</SectionTitle>
          <PTable
            cols={DETAIL_COLS}
            rows={[
              ...data.fuelDetail.map((d) => ({
                cells: [
                  dShort(d.date),
                  d.nozzle,
                  d.du,
                  d.product,
                  d.shift,
                  d.attendant,
                  num(d.opening, 3),
                  num(d.closing, 3),
                  d.testing ? num(d.testing) : '',
                  num(d.netL),
                  num(d.rate),
                  amt(d.value),
                ],
              })),
              {
                kind: 'subtotal' as const,
                cells: [
                  `Shown: ${data.fuelDetail.length} rows (01 Oct) · ${data.fuelDetailMore} more rows in the full report`,
                  ...blank(8),
                  num(detailL),
                  '',
                  amt(detailTotal),
                ],
              },
            ]}
          />
        </React.Fragment>,
        <React.Fragment key="p3">
          <SectionTitle>Daily trend</SectionTitle>
          <Columns>
            <Column>
              <PTable cols={TREND_COLS} rows={trendRows(data.daily.slice(0, half))} />
            </Column>
            <Column>
              <PTable
                cols={TREND_COLS}
                rows={[
                  ...trendRows(data.daily.slice(half)),
                  {
                    kind: 'total',
                    cells: [
                      'Period',
                      num(data.daily.reduce((a, d) => a + d.fuelL, 0)),
                      amt(data.daily.reduce((a, d) => a + d.fuelValue, 0)),
                      amt(data.daily.reduce((a, d) => a + d.productValue, 0)),
                      amt(data.daily.reduce((a, d) => a + d.fuelValue + d.productValue, 0)),
                    ],
                  },
                ]}
              />
            </Column>
          </Columns>
        </React.Fragment>,
      ]}
    />
  );
};

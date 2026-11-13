import React from 'react';
import {
  C,
  KpiStrip,
  PTable,
  ProposalDoc,
  SectionTitle,
  amt,
  num,
  pct,
  qty,
  rs0,
  type PCol,
  type PRow,
  type ProposalContext,
} from './shared.js';

/** One product's stock over the period, from its stock movements. */
export interface StockLine {
  product: string;
  /** Group-B product category pick-list. */
  category: string;
  type: 'Fuel' | 'Product';
  unit: 'L' | 'Nos';
  opening: number;
  /** Fuel: measured Decantation receipts; products: Purchases. */
  inQty: number;
  /** Fuel: nozzle litres net of testing; products: Product Sales. */
  outQty: number;
  /** Fuel: Tank Dip Variance; products: Physical Count Variance (signed). */
  adjust: number;
  /** opening + in − out ± adjust. */
  closing: number;
  /** Current cost price per unit (fuel VAT inclusive; products ex GST). */
  rate: number;
  /** Group B: products only (fuel is watched by Days of Cover). */
  reorderLevel?: number;
}

export interface StockStatementData {
  filters: {
    period: string;
    asOf: string;
    category: string;
    product: string;
    lowStockOnly: string;
  };
  lines: StockLine[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export const stockValue = (l: StockLine) => r2(l.closing * l.rate);
export const isLow = (l: StockLine) => l.reorderLevel !== undefined && l.closing < l.reorderLevel;
const q = (n: number, unit: string, plus = false) =>
  unit === 'L' ? num(n, 2, plus) : num(n, 0, plus);

const COLS: PCol[] = [
  { header: 'Product', flex: 2.3, strong: true },
  { header: 'Category', flex: 0.95, proposed: true },
  { header: 'Unit', flex: 0.45 },
  { header: 'Opening', flex: 1.1, align: 'right', mono: true },
  { header: 'In (purchases)', flex: 1.15, align: 'right', mono: true },
  { header: 'Out (sales)', flex: 1.15, align: 'right', mono: true },
  { header: 'Adj. / variance', flex: 0.95, align: 'right', mono: true },
  { header: 'Closing', flex: 1.1, align: 'right', mono: true, strong: true },
  { header: 'Cost (₹)', flex: 0.85, align: 'right', mono: true },
  { header: 'Stock value (₹)', flex: 1.35, align: 'right', mono: true, strong: true },
  { header: 'Reorder', flex: 0.75, align: 'right', mono: true, proposed: true },
  { header: 'Flag', flex: 0.6, align: 'center', proposed: true },
];

const lineRow = (l: StockLine): PRow => {
  const low = isLow(l);
  return {
    highlight: low ? 'warn' : undefined,
    cells: [
      l.product,
      l.category,
      l.unit,
      q(l.opening, l.unit),
      q(l.inQty, l.unit),
      q(l.outQty, l.unit),
      l.adjust ? { text: q(l.adjust, l.unit, true), color: l.adjust < 0 ? C.danger : C.amber } : '',
      q(l.closing, l.unit),
      num(l.rate),
      amt(stockValue(l)),
      l.reorderLevel === undefined ? '—' : String(l.reorderLevel),
      low ? { text: 'Low', color: C.danger, bold: true } : '',
    ],
  };
};

/** Quantities add up only within one unit; a mixed group prints value alone. */
const groupTotal = (label: string, ls: StockLine[], kind: 'subtotal' | 'total'): PRow => {
  const unit = ls.every((l) => l.unit === ls[0].unit) ? ls[0].unit : undefined;
  const t = (f: (l: StockLine) => number) => r2(ls.reduce((a, l) => a + f(l), 0));
  const qtyCells = unit
    ? [
        q(
          t((l) => l.opening),
          unit,
        ),
        q(
          t((l) => l.inQty),
          unit,
        ),
        q(
          t((l) => l.outQty),
          unit,
        ),
        t((l) => l.adjust)
          ? q(
              t((l) => l.adjust),
              unit,
              true,
            )
          : '',
        q(
          t((l) => l.closing),
          unit,
        ),
      ]
    : ['', '', '', '', ''];
  const low = ls.filter(isLow).length;
  return {
    kind,
    cells: [
      label,
      '',
      unit ?? '',
      ...qtyCells,
      '',
      amt(t(stockValue)),
      '',
      low ? { text: `${low} low`, color: C.danger } : '',
    ],
  };
};

/** The statement: fuel, then products by category, each with a subtotal of stock value. */
export function stockRows(lines: StockLine[]): PRow[] {
  const rows: PRow[] = [];
  const fuel = lines.filter((l) => l.type === 'Fuel');
  const products = lines.filter((l) => l.type === 'Product');
  rows.push({
    kind: 'group',
    label: 'Fuel',
    detail: 'litres · in = Decantation receipts · variance = Tank Dip',
  });
  rows.push(...fuel.map(lineRow));
  rows.push(groupTotal('Fuel subtotal', fuel, 'subtotal'));
  for (const cat of [...new Set(products.map((l) => l.category))]) {
    const ls = products.filter((l) => l.category === cat);
    rows.push({
      kind: 'group',
      label: `Product · ${cat}`,
      detail: 'Nos · variance = Physical Count',
    });
    rows.push(...ls.map(lineRow));
    // A one-item category's row is its own subtotal.
    if (ls.length > 1) rows.push(groupTotal(`${cat} subtotal`, ls, 'subtotal'));
  }
  rows.push(groupTotal('Products subtotal', products, 'subtotal'));
  rows.push(groupTotal('Total stock value', lines, 'total'));
  return rows;
}

const CAT_COLS: PCol[] = [
  { header: 'Category', flex: 2, strong: true, proposed: true },
  { header: 'Items', flex: 0.7, align: 'right', mono: true },
  { header: 'Closing qty', flex: 1.3, align: 'right', mono: true },
  { header: 'Stock value (₹)', flex: 1.4, align: 'right', mono: true, strong: true },
  { header: 'Share', flex: 0.8, align: 'right', mono: true },
  { header: 'Below reorder', flex: 1, align: 'right', mono: true, proposed: true },
];

/** One line per category: what the period closed with and its share of the stock value. */
export function categoryRows(lines: StockLine[], total: number): PRow[] {
  const cats = [...new Set(lines.map((l) => l.category))];
  return [
    ...cats.map((cat) => {
      const ls = lines.filter((l) => l.category === cat);
      const value = r2(ls.reduce((a, l) => a + stockValue(l), 0));
      const low = ls.filter(isLow).length;
      return {
        cells: [
          cat,
          String(ls.length),
          qty(r2(ls.reduce((a, l) => a + l.closing, 0)), ls[0].unit),
          amt(value),
          pct((value / total) * 100),
          low ? { text: String(low), color: C.danger } : '',
        ],
      };
    }),
    {
      kind: 'total' as const,
      cells: [
        'All categories',
        String(lines.length),
        '',
        amt(total),
        pct(100),
        String(lines.filter(isLow).length),
      ],
    },
  ];
}

const LOW_COLS: PCol[] = [
  { header: 'Product', flex: 2.3, strong: true },
  { header: 'Category', flex: 1, proposed: true },
  { header: 'Closing', flex: 0.9, align: 'right', mono: true },
  { header: 'Reorder level', flex: 1, align: 'right', mono: true, proposed: true },
  { header: 'Below by', flex: 0.9, align: 'right', mono: true },
  { header: 'Sold in period', flex: 1, align: 'right', mono: true },
  { header: 'Avg / day', flex: 0.9, align: 'right', mono: true },
  { header: 'Days left', flex: 0.9, align: 'right', mono: true },
  { header: 'Value at cost (₹)', flex: 1.2, align: 'right', mono: true },
];

export const StockStatementDoc = ({
  data,
  ctx,
}: {
  data: StockStatementData;
  ctx: ProposalContext;
}) => {
  const f = data.filters;
  const total = r2(data.lines.reduce((a, l) => a + stockValue(l), 0));
  const fuelValue = r2(
    data.lines.filter((l) => l.type === 'Fuel').reduce((a, l) => a + stockValue(l), 0),
  );
  const productValue = r2(total - fuelValue);
  const low = data.lines.filter(isLow);
  const days = 31;

  return (
    <ProposalDoc
      orientation="landscape"
      frame={{
        ...ctx,
        title: 'STOCK REPORT — PERIOD STATEMENT',
        subtitle:
          'Opening, in, out, adjustments and closing for every product over the period, valued at cost; Closing = Opening + In − Out ± Adjustments.',
        filters: [
          { label: 'Period', value: f.period },
          { label: 'As of', value: f.asOf },
          { label: 'Category', value: f.category, proposed: true },
          { label: 'Product', value: f.product },
          { label: 'Low stock only', value: f.lowStockOnly, proposed: true },
        ],
        notes: [
          {
            text: 'Quantities come from stock_movements, the single source of truth: fuel in = measured Decantation Tank Lines, out = nozzle litres net of testing, adjustment = Tank Dip Variance; products in = Purchases, out = Product Sales, adjustment = Physical Count Variance.',
          },
          {
            text: 'Stock value = closing × the product’s current cost price (fuel VAT inclusive, since VAT is not claimable; products ex GST). No historical, weighted-average or FIFO cost.',
          },
          {
            text: 'Category column, category subtotals and the Category filter (marked *).',
            needs: 'product category pick-list, group B',
          },
          {
            text: 'Reorder level, the Low stock flag and the “Low stock only” filter (marked *); fuel stays on Days of Cover.',
            needs: 'reorder level per product, group B',
          },
        ],
      }}
      pages={[
        <React.Fragment key="p1">
          <SectionTitle>Stock statement — Oct 2026</SectionTitle>
          <PTable cols={COLS} rows={stockRows(data.lines)} />
        </React.Fragment>,
        <React.Fragment key="p2">
          <KpiStrip
            items={[
              { l: 'Total stock value', v: rs0(total) },
              { l: 'Fuel stock value', v: rs0(fuelValue) },
              { l: 'Product stock value', v: rs0(productValue) },
              {
                l: 'Items below reorder*',
                v: String(low.length),
                c: low.length ? C.danger : C.success,
              },
            ]}
          />
          <SectionTitle>Stock value by category</SectionTitle>
          <PTable cols={CAT_COLS} rows={categoryRows(data.lines, total)} />
          <SectionTitle tag="proposed · reorder level">Items below reorder level</SectionTitle>
          <PTable
            cols={LOW_COLS}
            rows={low.map((l) => {
              const perDay = l.outQty / days;
              return {
                highlight: 'warn' as const,
                cells: [
                  l.product,
                  l.category,
                  qty(l.closing, l.unit),
                  qty(l.reorderLevel ?? 0, l.unit),
                  { text: qty((l.reorderLevel ?? 0) - l.closing, l.unit), color: C.danger },
                  qty(l.outQty, l.unit),
                  num(perDay, 1),
                  num(l.closing / perDay, 1),
                  amt(stockValue(l)),
                ],
              };
            })}
          />
        </React.Fragment>,
      ]}
    />
  );
};

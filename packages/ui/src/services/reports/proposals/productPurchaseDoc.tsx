import React from 'react';
import {
  KpiStrip,
  PTable,
  ProposalDoc,
  SectionTitle,
  amt,
  dShort,
  num,
  qty,
  rs0,
  type PCol,
  type PRow,
  type ProposalContext,
} from './shared.js';

/**
 * One line of a supplier invoice. A fuel line comes from a Fuel Purchase (an
 * Office Record: `date` is its Entry Date, VAT, no stock); a product line from
 * a product Purchase (`date` is its Business Date, GST, adds stock).
 */
export interface PurchaseLine {
  date: string;
  supplier: string;
  gstin: string;
  billNo: string;
  billDate: string;
  product: string;
  /** Group-B product category pick-list. */
  category: string;
  type: 'Fuel' | 'Product';
  unit: 'L' | 'Nos';
  qty: number;
  /** Unit rate before tax. */
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  vat: number;
  total: number;
}

export interface ProductPurchaseData {
  filters: { period: string; supplier: string; product: string; category: string };
  lines: PurchaseLine[];
  /** Product display order in the product-wise summary (fuel first, then the shelf). */
  productOrder: string[];
}

type Totals = Pick<PurchaseLine, 'taxable' | 'cgst' | 'sgst' | 'igst' | 'vat' | 'total'>;
const KEYS: (keyof Totals)[] = ['taxable', 'cgst', 'sgst', 'igst', 'vat', 'total'];
export const addTotals = (xs: Totals[]): Totals => {
  const t: Totals = { taxable: 0, cgst: 0, sgst: 0, igst: 0, vat: 0, total: 0 };
  for (const x of xs) for (const k of KEYS) t[k] += x[k];
  for (const k of KEYS) t[k] = Math.round(t[k] * 100) / 100;
  return t;
};
const gstOf = (t: Totals) => Math.round((t.cgst + t.sgst + t.igst) * 100) / 100;
const blank = (n: number) => Array.from({ length: n }, () => '');

const REG_COLS: PCol[] = [
  { header: 'Date', flex: 0.65 },
  { header: 'Bill no', flex: 1.25, mono: true },
  { header: 'Bill date', flex: 0.7 },
  { header: 'Product', flex: 2.1, strong: true },
  { header: 'Category', flex: 0.9, proposed: true },
  { header: 'Qty', flex: 1.15, align: 'right', mono: true },
  { header: 'Rate (₹)', flex: 0.95, align: 'right', mono: true },
  { header: 'Taxable (₹)', flex: 1.35, align: 'right', mono: true },
  { header: 'CGST (₹)', flex: 1, align: 'right', mono: true },
  { header: 'SGST (₹)', flex: 1, align: 'right', mono: true },
  { header: 'IGST (₹)', flex: 0.65, align: 'right', mono: true },
  { header: 'VAT (₹)', flex: 1.2, align: 'right', mono: true },
  { header: 'Total (₹)', flex: 1.4, align: 'right', mono: true, strong: true },
];

/** Totals cells; a tax the lines cannot carry (GST on fuel, VAT on products) prints blank. */
const moneyCells = (t: Totals, gst: boolean, vat: boolean) => [
  amt(t.taxable),
  gst ? amt(t.cgst) : '',
  gst ? amt(t.sgst) : '',
  gst ? amt(t.igst) : '',
  vat ? amt(t.vat) : '',
  amt(t.total),
];

/** The register: one band per supplier, its invoice lines by date, a supplier subtotal. */
export function registerRows(lines: PurchaseLine[]): PRow[] {
  const rows: PRow[] = [];
  const suppliers = [...new Set(lines.map((l) => l.supplier))];
  for (const name of suppliers) {
    const ls = lines
      .filter((l) => l.supplier === name)
      .sort((a, b) => a.date.localeCompare(b.date) || a.billNo.localeCompare(b.billNo));
    const hasFuel = ls.some((l) => l.type === 'Fuel');
    const hasProduct = ls.some((l) => l.type === 'Product');
    const bills = new Set(ls.map((l) => l.billNo)).size;
    rows.push({
      kind: 'group',
      label: name,
      detail: `GSTIN ${ls[0].gstin} · ${bills} invoices · ${hasFuel ? 'Fuel Purchases (VAT, Entry Date)' : 'Product Purchases (GST, Business Date)'}`,
    });
    for (const l of ls) {
      const fuel = l.type === 'Fuel';
      rows.push({
        cells: [
          dShort(l.date),
          l.billNo,
          dShort(l.billDate),
          l.product,
          l.category,
          qty(l.qty, l.unit, fuel ? 0 : undefined),
          num(l.rate),
          ...moneyCells(l, !fuel, fuel),
        ],
      });
    }
    rows.push({
      kind: 'subtotal',
      cells: [`${name} — subtotal`, ...blank(6), ...moneyCells(addTotals(ls), hasProduct, hasFuel)],
    });
  }
  rows.push({
    kind: 'total',
    cells: ['Grand total', ...blank(6), ...moneyCells(addTotals(lines), true, true)],
  });
  return rows;
}

const SUM_COLS: PCol[] = [
  { header: 'Product', flex: 2.4, strong: true },
  { header: 'Category', flex: 1.1, proposed: true },
  { header: 'Invoices', flex: 0.7, align: 'right', mono: true },
  { header: 'Qty', flex: 1.3, align: 'right', mono: true },
  { header: 'Avg rate (₹)', flex: 1, align: 'right', mono: true },
  { header: 'Taxable (₹)', flex: 1.5, align: 'right', mono: true },
  { header: 'GST (ITC) (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'VAT (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Total (₹)', flex: 1.5, align: 'right', mono: true, strong: true },
];

/** The product-wise summary: one line per product, a subtotal per type, a grand total. */
export function productSummaryRows(lines: PurchaseLine[], order: string[]): PRow[] {
  const rows: PRow[] = [];
  const types: { type: PurchaseLine['type']; label: string; detail: string }[] = [
    { type: 'Fuel', label: 'Fuel', detail: 'VAT, outside GST — not claimable as ITC' },
    { type: 'Product', label: 'Products', detail: 'GST — input tax credit' },
  ];
  for (const t of types) {
    const ofType = lines.filter((l) => l.type === t.type);
    if (!ofType.length) continue;
    rows.push({ kind: 'group', label: t.label, detail: t.detail });
    const products = order.filter((p) => ofType.some((l) => l.product === p));
    for (const p of products) {
      const ls = ofType.filter((l) => l.product === p);
      const sum = addTotals(ls);
      const q = Math.round(ls.reduce((a, l) => a + l.qty, 0) * 100) / 100;
      const fuel = t.type === 'Fuel';
      rows.push({
        cells: [
          p,
          ls[0].category,
          String(new Set(ls.map((l) => l.billNo)).size),
          qty(q, ls[0].unit, fuel ? 0 : undefined),
          num(sum.taxable / q),
          amt(sum.taxable),
          fuel ? '' : amt(gstOf(sum)),
          fuel ? amt(sum.vat) : '',
          amt(sum.total),
        ],
      });
    }
    const sum = addTotals(ofType);
    const fuel = t.type === 'Fuel';
    const q = Math.round(ofType.reduce((a, l) => a + l.qty, 0) * 100) / 100;
    rows.push({
      kind: 'subtotal',
      cells: [
        `${t.label} subtotal`,
        '',
        String(new Set(ofType.map((l) => l.billNo)).size),
        qty(q, fuel ? 'L' : 'Nos', fuel ? 0 : undefined),
        '',
        amt(sum.taxable),
        fuel ? '' : amt(gstOf(sum)),
        fuel ? amt(sum.vat) : '',
        amt(sum.total),
      ],
    });
  }
  const all = addTotals(lines);
  rows.push({
    kind: 'total',
    cells: [
      'Grand total',
      '',
      String(new Set(lines.map((l) => l.billNo)).size),
      '',
      '',
      amt(all.taxable),
      amt(gstOf(all)),
      amt(all.vat),
      amt(all.total),
    ],
  });
  return rows;
}

export const ProductPurchaseDoc = ({
  data,
  ctx,
}: {
  data: ProductPurchaseData;
  ctx: ProposalContext;
}) => {
  const f = data.filters;
  const all = addTotals(data.lines);
  const fuel = addTotals(data.lines.filter((l) => l.type === 'Fuel'));
  const products = addTotals(data.lines.filter((l) => l.type === 'Product'));
  const invoices = new Set(data.lines.map((l) => `${l.supplier}|${l.billNo}`)).size;

  return (
    <ProposalDoc
      orientation="landscape"
      frame={{
        ...ctx,
        title: 'PRODUCT-WISE PURCHASE REPORT',
        subtitle:
          'What was bought, from whom, on which bill, at what rate and tax — fuel (VAT) and products (GST) in one register, kept apart.',
        filters: [
          { label: 'Period', value: f.period },
          { label: 'Supplier', value: f.supplier },
          { label: 'Product', value: f.product },
          { label: 'Category', value: f.category, proposed: true },
        ],
        notes: [
          {
            text: 'Fuel lines come from Fuel Purchases: Office Records dated by Entry Date (the bill date may be earlier). They record the payable only; fuel stock comes from Decantation (ADR 0007).',
          },
          {
            text: 'Product lines come from product Purchases, dated by their Business Date; each adds stock. Paying any bill is a separate Supplier Payment and is not in this report.',
          },
          {
            text: 'GST input tax credit (ITC) is on products only. Fuel VAT is shown in its own column, is never added to GST and is not claimable as GST ITC. Today’s GST purchase register leaves fuel out.',
          },
          {
            text: 'Category column and the Category filter (marked *).',
            needs: 'product category pick-list, group B',
          },
        ],
      }}
      pages={[
        <React.Fragment key="p1">
          <KpiStrip
            items={[
              { l: 'Total purchases', v: rs0(all.total) },
              { l: 'Invoices', v: String(invoices) },
              { l: 'Fuel (incl. VAT)', v: rs0(fuel.total) },
              { l: 'Fuel VAT', v: rs0(fuel.vat) },
              { l: 'Products taxable', v: rs0(products.taxable) },
              { l: 'ITC (GST input)', v: rs0(gstOf(products)) },
            ]}
          />
          <SectionTitle>Purchase register — by supplier</SectionTitle>
          <PTable cols={REG_COLS} rows={registerRows(data.lines)} />
        </React.Fragment>,
        <React.Fragment key="p2">
          <SectionTitle>Product-wise summary</SectionTitle>
          <PTable cols={SUM_COLS} rows={productSummaryRows(data.lines, data.productOrder)} />
        </React.Fragment>,
      ]}
    />
  );
};

import React from 'react';
import {
  KpiStrip,
  PTable,
  ProposalDoc,
  SectionTitle,
  amt,
  dShort,
  rs0,
  sum,
  type PCell,
  type PCol,
  type PRow,
  type ProposalContext,
} from './shared.js';

export interface TaxHeads {
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
}

/** One row of Table 3.1; `value` absent means nil, `unsupported` means PumpOS cannot capture it yet. */
export interface Gstr3bOutwardRow {
  code: string;
  label: string;
  detail?: string;
  taxable?: number;
  tax?: TaxHeads;
  unsupported?: boolean;
}

/** One row of Table 4. */
export interface Gstr3bItcRow {
  code: string;
  label: string;
  tax?: TaxHeads;
  unsupported?: boolean;
}

/** A product Purchase whose GST is claimed as ITC. */
export interface Gstr3bItcSource {
  date: string;
  supplier: string;
  gstin: string;
  invoiceNo: string;
  taxable: number;
  cgst: number;
  sgst: number;
}

/** Where 3.1(a) comes from, by kind of supply. */
export interface Gstr3bOutputSource {
  label: string;
  gstr1Table: string;
  taxable: number;
  cgst: number;
  sgst: number;
}

export interface Gstr3bData {
  filters: { period: string; gstin: string; station: string };
  outward: Gstr3bOutwardRow[];
  /** GSTR-1 totals for the same period: 3.1(a) must agree with them. */
  gstr1: { taxable: number; tax: TaxHeads };
  itcAvailable: Gstr3bItcRow[];
  itcReversed: Gstr3bItcRow[];
  itcSources: Gstr3bItcSource[];
  outputSources: Gstr3bOutputSource[];
}

const HEADS = ['igst', 'cgst', 'sgst', 'cess'] as const;
const HEAD_LABEL = {
  igst: 'Integrated tax (IGST)',
  cgst: 'Central tax (CGST)',
  sgst: 'State tax (SGST)',
  cess: 'Cess',
};
const zero = (): TaxHeads => ({ igst: 0, cgst: 0, sgst: 0, cess: 0 });
const addTax = (xs: (TaxHeads | undefined)[]): TaxHeads => {
  const t = zero();
  for (const x of xs) if (x) for (const h of HEADS) t[h] = Math.round((t[h] + x[h]) * 100) / 100;
  return t;
};
const totalTax = (t: TaxHeads) => sum([...HEADS], (h) => t[h]);
const taxCells = (t?: TaxHeads, unsupported?: boolean): PCell[] =>
  HEADS.map((h) => (unsupported ? '—' : t ? amt(t[h]) : amt(0)));

const OUT_COLS: PCol[] = [
  { header: 'Nature of supplies', flex: 4.4 },
  { header: 'Taxable value (₹)', flex: 1.4, align: 'right', mono: true },
  { header: 'IGST (₹)', flex: 0.8, align: 'right', mono: true },
  { header: 'CGST (₹)', flex: 1, align: 'right', mono: true },
  { header: 'SGST (₹)', flex: 1, align: 'right', mono: true },
  { header: 'Cess (₹)', flex: 0.7, align: 'right', mono: true },
];

export function outwardRows(data: Gstr3bData): PRow[] {
  const a = data.outward.find((r) => r.code === 'a');
  const g = data.gstr1;
  const agrees =
    a?.taxable === g.taxable && a.tax !== undefined && HEADS.every((h) => a.tax![h] === g.tax[h]);
  return [
    ...data.outward.map((r) => ({
      highlight: r.unsupported ? ('muted' as const) : undefined,
      cells: [
        { text: `(${r.code}) ${r.label}`, detail: r.detail },
        r.unsupported ? '—' : amt(r.taxable ?? 0),
        ...(r.code === 'e' ? ['', '', '', ''] : taxCells(r.tax, r.unsupported)),
      ],
    })),
    {
      kind: 'subtotal' as const,
      cells: [
        {
          text: `GSTR-1 for the period (4A + 7) — ${agrees ? 'agrees with 3.1(a)' : 'DIFFERS from 3.1(a)'}`,
        },
        amt(g.taxable),
        ...taxCells(g.tax),
      ],
    },
  ];
}

const ITC_COLS: PCol[] = [
  { header: 'Details', flex: 4.4 },
  { header: 'IGST (₹)', flex: 0.9, align: 'right', mono: true },
  { header: 'CGST (₹)', flex: 1.1, align: 'right', mono: true },
  { header: 'SGST (₹)', flex: 1.1, align: 'right', mono: true },
  { header: 'Cess (₹)', flex: 0.8, align: 'right', mono: true },
];

const netItc = (data: Gstr3bData) => {
  const avail = addTax(data.itcAvailable.map((r) => r.tax));
  const rev = addTax(data.itcReversed.map((r) => r.tax));
  const net = zero();
  for (const h of HEADS) net[h] = Math.round((avail[h] - rev[h]) * 100) / 100;
  return net;
};

export function itcRows(data: Gstr3bData): PRow[] {
  const line = (r: Gstr3bItcRow): PRow => ({
    highlight: r.unsupported ? 'muted' : undefined,
    cells: [`${r.code} ${r.label}`, ...taxCells(r.tax, r.unsupported)],
  });
  return [
    { kind: 'group', label: '(A) ITC available (whether in full or part)' },
    ...data.itcAvailable.map(line),
    { kind: 'group', label: '(B) ITC reversed' },
    ...data.itcReversed.map(line),
    { kind: 'total', cells: ['(C) Net ITC available (A − B)', ...taxCells(netItc(data))] },
  ];
}

const PAY_COLS: PCol[] = [
  { header: 'Tax head', flex: 2.2, strong: true },
  { header: 'Tax payable (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'Paid through ITC (₹)', flex: 1.4, align: 'right', mono: true },
  { header: 'Paid in cash (₹)', flex: 1.3, align: 'right', mono: true, strong: true },
  { header: 'ITC carried forward (₹)', flex: 1.5, align: 'right', mono: true },
];

/** 6.1: each head's tax set off against the same head's ITC; the rest is paid in cash. */
export function paymentLines(data: Gstr3bData) {
  const payable = data.outward.find((r) => r.code === 'a')?.tax ?? zero();
  const itc = netItc(data);
  return HEADS.map((h) => {
    const used = Math.min(payable[h], itc[h]);
    return {
      head: h,
      payable: payable[h],
      itc: used,
      cash: Math.round((payable[h] - used) * 100) / 100,
      carried: Math.round((itc[h] - used) * 100) / 100,
    };
  });
}

const OUT_SRC_COLS: PCol[] = [
  { header: 'Supply', flex: 3.2, strong: true },
  { header: 'GSTR-1 table', flex: 1.1 },
  { header: 'Taxable (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'CGST (₹)', flex: 1.1, align: 'right', mono: true },
  { header: 'SGST (₹)', flex: 1.1, align: 'right', mono: true },
  { header: 'Total tax (₹)', flex: 1.2, align: 'right', mono: true, strong: true },
];

const SRC_COLS: PCol[] = [
  { header: 'Date', flex: 0.7 },
  { header: 'Supplier', flex: 2.2, strong: true },
  { header: 'Supplier GSTIN', flex: 1.6, mono: true },
  { header: 'Invoice no', flex: 1.3, mono: true },
  { header: 'Taxable (₹)', flex: 1.2, align: 'right', mono: true },
  { header: 'CGST (₹)', flex: 1, align: 'right', mono: true },
  { header: 'SGST (₹)', flex: 1, align: 'right', mono: true },
];

export const Gstr3bDoc = ({ data, ctx }: { data: Gstr3bData; ctx: ProposalContext }) => {
  const f = data.filters;
  const a = data.outward.find((r) => r.code === 'a');
  const e = data.outward.find((r) => r.code === 'e');
  const pay = paymentLines(data);
  const itc = netItc(data);
  const src = data.itcSources;

  return (
    <ProposalDoc
      frame={{
        ...ctx,
        title: 'GSTR-3B — MONTHLY SUMMARY',
        subtitle:
          'The month’s GST liability, input tax credit and the tax left to pay in cash, as GSTR-3B asks for it.',
        filters: [
          { label: 'Return period', value: f.period },
          { label: 'GSTIN', value: f.gstin },
          { label: 'Station', value: f.station },
        ],
        notes: [
          {
            text: '3.1(a) is GST on Product Sales and Income and equals GSTR-1. Fuel VAT is filed separately under Kerala VAT; fuel enters 3B only as 3.1(e).',
          },
          {
            text: 'ITC is the GST split on product Purchases, not yet reconciled with GSTR-2B (check 2B before filing). GST on expenses is not captured.',
          },
          {
            text: 'Reverse charge, imports and ISD are not supported yet (“—”). 6.1 sets each head off against its own ITC; interest and late fee are not computed.',
          },
        ],
      }}
      pages={[
        <React.Fragment key="p1">
          <KpiStrip
            items={[
              { l: 'Output GST', v: rs0(totalTax(a?.tax ?? zero())) },
              { l: 'Net ITC', v: rs0(totalTax(itc)) },
              { l: 'Payable in cash', v: rs0(sum(pay, (p) => p.cash)) },
              { l: 'Non-GST (fuel)', v: rs0(e?.taxable ?? 0) },
            ]}
          />
          <SectionTitle>3.1 — Outward and inward (reverse charge) supplies</SectionTitle>
          <PTable cols={OUT_COLS} rows={outwardRows(data)} />
          <SectionTitle>4 — Eligible ITC</SectionTitle>
          <PTable cols={ITC_COLS} rows={itcRows(data)} />
          <SectionTitle>6.1 — Payment of tax</SectionTitle>
          <PTable
            cols={PAY_COLS}
            rows={[
              ...pay.map((p) => ({
                cells: [
                  HEAD_LABEL[p.head],
                  amt(p.payable),
                  amt(p.itc),
                  amt(p.cash),
                  amt(p.carried),
                ],
              })),
              {
                kind: 'total' as const,
                cells: [
                  'Total',
                  amt(sum(pay, (p) => p.payable)),
                  amt(sum(pay, (p) => p.itc)),
                  amt(sum(pay, (p) => p.cash)),
                  amt(sum(pay, (p) => p.carried)),
                ],
              },
            ]}
          />
        </React.Fragment>,
        <React.Fragment key="p2">
          <SectionTitle>Where the output tax comes from</SectionTitle>
          <PTable
            cols={OUT_SRC_COLS}
            rows={[
              ...data.outputSources.map((o) => ({
                cells: [
                  o.label,
                  o.gstr1Table,
                  amt(o.taxable),
                  amt(o.cgst),
                  amt(o.sgst),
                  amt(o.cgst + o.sgst),
                ],
              })),
              {
                kind: 'total' as const,
                cells: [
                  '= 3.1(a)',
                  '',
                  amt(sum(data.outputSources, (o) => o.taxable)),
                  amt(sum(data.outputSources, (o) => o.cgst)),
                  amt(sum(data.outputSources, (o) => o.sgst)),
                  amt(sum(data.outputSources, (o) => o.cgst + o.sgst)),
                ],
              },
            ]}
          />
          <SectionTitle>Where the ITC comes from — product Purchases</SectionTitle>
          <PTable
            cols={SRC_COLS}
            rows={[
              ...src.map((s) => ({
                cells: [
                  dShort(s.date),
                  s.supplier,
                  s.gstin,
                  s.invoiceNo,
                  amt(s.taxable),
                  amt(s.cgst),
                  amt(s.sgst),
                ],
              })),
              {
                kind: 'total' as const,
                cells: [
                  `${src.length} Purchases`,
                  '',
                  '',
                  '',
                  amt(sum(src, (s) => s.taxable)),
                  amt(sum(src, (s) => s.cgst)),
                  amt(sum(src, (s) => s.sgst)),
                ],
              },
            ]}
          />
        </React.Fragment>,
      ]}
    />
  );
};

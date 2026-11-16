import React from 'react';
import {
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
  rs0,
  sum,
  type PCol,
  type PRow,
  type ProposalContext,
} from './shared.js';

/** Tax on a taxable value: intra-state supplies split CGST + SGST; IGST is for inter-state. */
export interface TaxSplit {
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
}

/** Table 4A: one row per GST invoice and rate, to a registered customer. */
export interface Gstr1B2bRow extends TaxSplit {
  gstin: string;
  name: string;
  invoiceNo: string;
  date: string;
  placeOfSupply: string;
  rate: number;
  value: number;
  /** What the invoice was for (printed small under the customer). */
  items: string;
}

/** Table 7: unregistered (B2C small) supplies, one row per place of supply and rate. */
export interface Gstr1B2csRow extends TaxSplit {
  placeOfSupply: string;
  rate: number;
}

/** Table 12: one row per HSN / SAC and rate, in the B2B or B2C tab. */
export interface Gstr1HsnRow extends TaxSplit {
  tab: 'B2B' | 'B2C';
  hsn: string;
  description: string;
  uqc: string;
  qty: number;
  rate: number;
}

/** Table 13: one invoice series. */
export interface Gstr1DocRow {
  nature: string;
  from: string;
  to: string;
  total: number;
  cancelled: number;
}

/** How the B2CS figure is reached from the books. */
export interface Gstr1B2csBuildUp {
  label: string;
  taxable: number;
  tax: number;
  sign: 1 | -1;
}

export interface Gstr1Data {
  filters: { period: string; gstin: string; station: string };
  b2b: Gstr1B2bRow[];
  b2cs: Gstr1B2csRow[];
  b2csBuildUp: Gstr1B2csBuildUp[];
  hsn: Gstr1HsnRow[];
  docs: Gstr1DocRow[];
  /** Fuel sales value in the period: outside GST, left out of every table. */
  fuelExcluded: number;
}

const tax = (t: TaxSplit) => t.igst + t.cgst + t.sgst + t.cess;
const add = (xs: TaxSplit[]): TaxSplit => ({
  taxable: sum(xs, (x) => x.taxable),
  igst: sum(xs, (x) => x.igst),
  cgst: sum(xs, (x) => x.cgst),
  sgst: sum(xs, (x) => x.sgst),
  cess: sum(xs, (x) => x.cess),
});

const B2B_COLS: PCol[] = [
  { header: 'Customer GSTIN', flex: 1.4, mono: true },
  { header: 'Customer name', flex: 3, strong: true },
  { header: 'Invoice no', flex: 1.3, mono: true },
  { header: 'Date', flex: 0.7 },
  { header: 'Place of supply', flex: 1 },
  { header: 'Taxable (₹)', flex: 1.2, align: 'right', mono: true },
  { header: 'Rate', flex: 0.5, align: 'right', mono: true },
  { header: 'CGST (₹)', flex: 1, align: 'right', mono: true },
  { header: 'SGST (₹)', flex: 1, align: 'right', mono: true },
  { header: 'IGST (₹)', flex: 0.7, align: 'right', mono: true },
  { header: 'Invoice value (₹)', flex: 1.3, align: 'right', mono: true, strong: true },
];

export function b2bRows(rows: Gstr1B2bRow[]): PRow[] {
  const t = add(rows);
  return [
    ...rows.map((r) => ({
      cells: [
        r.gstin,
        { text: r.name, detail: r.items },
        r.invoiceNo,
        dShort(r.date),
        r.placeOfSupply,
        amt(r.taxable),
        pct(r.rate, 0),
        amt(r.cgst),
        amt(r.sgst),
        amt(r.igst),
        amt(r.value),
      ],
    })),
    {
      kind: 'total' as const,
      cells: [
        `B2B total · ${rows.length} invoices`,
        '',
        '',
        '',
        '',
        amt(t.taxable),
        '',
        amt(t.cgst),
        amt(t.sgst),
        amt(t.igst),
        amt(sum(rows, (r) => r.value)),
      ],
    },
  ];
}

const B2CS_COLS: PCol[] = [
  { header: 'Type', flex: 0.6 },
  { header: 'Place of supply', flex: 1.2 },
  { header: 'Rate', flex: 0.6, align: 'right', mono: true },
  { header: 'Taxable (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'CGST (₹)', flex: 1.1, align: 'right', mono: true },
  { header: 'SGST (₹)', flex: 1.1, align: 'right', mono: true },
  { header: 'Cess (₹)', flex: 0.8, align: 'right', mono: true },
];

const BUILD_COLS: PCol[] = [
  { header: 'B2CS build-up', flex: 2.6 },
  { header: 'Taxable (₹)', flex: 1.2, align: 'right', mono: true },
  { header: 'Tax (₹)', flex: 1, align: 'right', mono: true },
];

const HSN_COLS: PCol[] = [
  { header: 'HSN / SAC', flex: 0.9, mono: true, strong: true },
  { header: 'Description', flex: 2.4 },
  { header: 'UQC', flex: 0.5 },
  { header: 'Qty', flex: 0.6, align: 'right', mono: true },
  { header: 'Rate', flex: 0.5, align: 'right', mono: true },
  { header: 'Taxable (₹)', flex: 1.2, align: 'right', mono: true },
  { header: 'IGST (₹)', flex: 0.7, align: 'right', mono: true },
  { header: 'CGST (₹)', flex: 1, align: 'right', mono: true },
  { header: 'SGST (₹)', flex: 1, align: 'right', mono: true },
  { header: 'Total tax (₹)', flex: 1.1, align: 'right', mono: true, strong: true },
];

const hsnMoney = (t: TaxSplit) => [
  amt(t.taxable),
  amt(t.igst),
  amt(t.cgst),
  amt(t.sgst),
  amt(tax(t)),
];

/** Table 12, in its B2B and B2C tabs, with a check row against Tables 4A + 7. */
export function hsnRows(data: Gstr1Data): PRow[] {
  const rows: PRow[] = [];
  for (const tab of ['B2B', 'B2C'] as const) {
    const inTab = data.hsn.filter((h) => h.tab === tab);
    rows.push({
      kind: 'group',
      label: `${tab} supplies`,
      detail: tab === 'B2B' ? 'agrees with Table 4A' : 'agrees with Table 7',
    });
    rows.push(
      ...inTab.map((h) => ({
        cells: [
          h.hsn,
          h.description,
          h.uqc,
          h.qty ? num(h.qty, 0) : '—',
          pct(h.rate, 0),
          ...hsnMoney(h),
        ],
      })),
    );
    rows.push({
      kind: 'subtotal',
      cells: [`${tab} subtotal`, '', '', '', '', ...hsnMoney(add(inTab))],
    });
  }
  rows.push({ kind: 'total', cells: ['HSN total', '', '', '', '', ...hsnMoney(add(data.hsn))] });
  rows.push({
    kind: 'subtotal',
    cells: [
      'Check: Table 4A + Table 7 (must agree)',
      '',
      '',
      '',
      '',
      ...hsnMoney(add([...data.b2b, ...data.b2cs])),
    ],
  });
  return rows;
}

const DOC_COLS: PCol[] = [
  { header: 'Nature of document', flex: 2.4, strong: true },
  { header: 'Sr. no from', flex: 1.4, mono: true },
  { header: 'Sr. no to', flex: 1.4, mono: true },
  { header: 'Total number', flex: 1, align: 'right', mono: true },
  { header: 'Cancelled', flex: 0.9, align: 'right', mono: true },
  { header: 'Net issued', flex: 0.9, align: 'right', mono: true, strong: true },
];

export const Gstr1Doc = ({ data, ctx }: { data: Gstr1Data; ctx: ProposalContext }) => {
  const f = data.filters;
  const all = add([...data.b2b, ...data.b2cs]);
  const b2cs = add(data.b2cs);
  const buildTaxable = sum(data.b2csBuildUp, (b) => b.sign * b.taxable);
  const buildTax = sum(data.b2csBuildUp, (b) => b.sign * b.tax);

  return (
    <ProposalDoc
      orientation="landscape"
      frame={{
        ...ctx,
        title: 'GSTR-1 — OUTWARD SUPPLIES',
        subtitle:
          'The month’s GST outward supplies, laid out as the GSTR-1 tables the accountant keys into the GST portal.',
        filters: [
          { label: 'Return period', value: f.period },
          { label: 'GSTIN', value: f.gstin },
          { label: 'Station', value: f.station },
        ],
        notes: [
          {
            text: 'GST supplies only: Product Sales (lubes, coolant, grease, accessories) and Income recorded with GST. Fuel is under Kerala VAT, outside GST, and is left out of every table.',
          },
          {
            text: 'Table 4A lists the GST invoices of Billed Sales to customers with a GSTIN; Table 7 is all other Product Sales (incl. Handover Product Sales) plus taxable Income, by rate. GST is as frozen on each sale / record.',
          },
          {
            text: 'Table 12 groups the same lines by HSN / SAC in B2B and B2C tabs and must agree with 4A + 7. Table 13 counts the GST invoice series of Billed Sales.',
          },
          {
            text: 'First version: credit / debit notes, amendments, B2C large (inter-state) and the portal JSON export come later.',
          },
        ],
      }}
      pages={[
        <React.Fragment key="p1">
          <KpiStrip
            items={[
              { l: 'Total taxable', v: rs0(all.taxable) },
              { l: 'Total tax', v: rs0(tax(all)) },
              { l: 'B2B invoices', v: String(data.b2b.length) },
              { l: 'B2CS taxable', v: rs0(b2cs.taxable) },
              { l: 'Fuel (VAT, excluded)', v: rs0(data.fuelExcluded) },
            ]}
          />
          <SectionTitle>Table 4A — B2B invoices</SectionTitle>
          <PTable cols={B2B_COLS} rows={b2bRows(data.b2b)} />
          <Columns>
            <Column flex={1.3}>
              <SectionTitle>Table 7 — B2C (small)</SectionTitle>
              <PTable
                cols={B2CS_COLS}
                rows={[
                  ...data.b2cs.map((r) => ({
                    cells: [
                      'OE',
                      r.placeOfSupply,
                      pct(r.rate, 0),
                      amt(r.taxable),
                      amt(r.cgst),
                      amt(r.sgst),
                      amt(r.cess),
                    ],
                  })),
                  {
                    kind: 'total' as const,
                    cells: [
                      'B2CS total',
                      '',
                      '',
                      amt(b2cs.taxable),
                      amt(b2cs.cgst),
                      amt(b2cs.sgst),
                      amt(b2cs.cess),
                    ],
                  },
                ]}
              />
            </Column>
            <Column>
              <SectionTitle>How Table 7 is reached</SectionTitle>
              <PTable
                cols={BUILD_COLS}
                rows={[
                  ...data.b2csBuildUp.map((b) => ({
                    cells: [b.label, amt(b.sign * b.taxable), amt(b.sign * b.tax)],
                  })),
                  { kind: 'total' as const, cells: ['= B2CS', amt(buildTaxable), amt(buildTax)] },
                ]}
              />
            </Column>
          </Columns>
          <SectionTitle>Table 12 — HSN-wise summary of outward supplies</SectionTitle>
          <PTable cols={HSN_COLS} rows={hsnRows(data)} />
          <SectionTitle>Table 13 — Documents issued</SectionTitle>
          <PTable
            cols={DOC_COLS}
            rows={data.docs.map((d) => ({
              cells: [
                d.nature,
                d.from,
                d.to,
                String(d.total),
                String(d.cancelled),
                String(d.total - d.cancelled),
              ],
            }))}
          />
        </React.Fragment>,
      ]}
    />
  );
};

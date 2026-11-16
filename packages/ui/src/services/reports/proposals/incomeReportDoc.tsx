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
  pct,
  rs0,
  sum,
  type PCol,
  type PRow,
  type ProposalContext,
} from './shared.js';

export type HeadType = 'Direct' | 'Indirect';

/** One Income Office Record: Entry Date, head, Funding Account and its GST split frozen at capture. */
export interface IncomeLine {
  date: string;
  head: string;
  /** Group-B flag on the income head. */
  type: HeadType;
  /** Read from the description today (no payer field yet). */
  payer: string;
  account: string;
  taxable: number;
  /** GST % frozen at capture; 0 = recorded without GST. */
  gstRate: number;
  gst: number;
  amount: number;
}

export interface IncomeReportData {
  filters: { period: string; head: string; type: string; account: string };
  /** Heads in print order (Direct first), with their group-B type. */
  heads: { head: string; type: HeadType }[];
  entries: IncomeLine[];
}

const COLS: PCol[] = [
  { header: 'Date', flex: 0.6 },
  { header: 'Head', flex: 1.9 },
  { header: 'Type', flex: 0.7, proposed: true },
  { header: 'Payer', flex: 3 },
  { header: 'Funding account', flex: 1.3 },
  { header: 'Taxable (₹)', flex: 1.2, align: 'right', mono: true },
  { header: 'GST (₹)', flex: 1, align: 'right', mono: true },
  { header: 'Amount (₹)', flex: 1.2, align: 'right', mono: true, strong: true },
];

const money = (xs: IncomeLine[]) => [
  amt(sum(xs, (e) => e.taxable)),
  amt(sum(xs, (e) => e.gst)),
  amt(sum(xs, (e) => e.amount)),
];

/** The register: a band per head (Direct heads first), each with a subtotal; then Direct, Indirect, Grand. */
export function incomeRows(data: IncomeReportData): PRow[] {
  const rows: PRow[] = [];
  for (const h of data.heads) {
    const inHead = data.entries.filter((e) => e.head === h.head);
    if (!inHead.length) continue;
    const rate = inHead[0].gstRate;
    rows.push({
      kind: 'group',
      label: h.head,
      detail: `${h.type} · ${rate ? `GST ${rate}%` : 'no GST'}`,
    });
    rows.push(
      ...inHead.map((e) => ({
        cells: [
          dShort(e.date),
          e.head,
          e.type,
          e.payer,
          e.account,
          amt(e.taxable),
          e.gstRate ? amt(e.gst) : '—',
          amt(e.amount),
        ],
      })),
    );
    rows.push({
      kind: 'subtotal',
      cells: [`${h.head} subtotal`, '', '', '', '', ...money(inHead)],
    });
  }
  const of = (t: HeadType) => data.entries.filter((e) => e.type === t);
  rows.push({ kind: 'subtotal', cells: ['Direct income', '', '', '', '', ...money(of('Direct'))] });
  rows.push({
    kind: 'subtotal',
    cells: ['Indirect income', '', '', '', '', ...money(of('Indirect'))],
  });
  rows.push({ kind: 'total', cells: ['Grand total', '', '', '', '', ...money(data.entries)] });
  return rows;
}

const HEAD_COLS: PCol[] = [
  { header: 'Head', flex: 2.4, strong: true },
  { header: 'Type', flex: 0.9, proposed: true },
  { header: 'Entries', flex: 0.7, align: 'right', mono: true },
  { header: 'Taxable (₹)', flex: 1.3, align: 'right', mono: true },
  { header: 'GST (₹)', flex: 1.1, align: 'right', mono: true },
  { header: 'Amount (₹)', flex: 1.3, align: 'right', mono: true },
];

const ACCOUNT_COLS: PCol[] = [
  { header: 'Funding account', flex: 1.8, strong: true },
  { header: 'Entries', flex: 0.7, align: 'right', mono: true },
  { header: 'Amount (₹)', flex: 1.4, align: 'right', mono: true },
  { header: 'Share', flex: 0.8, align: 'right', mono: true },
];

export const IncomeReportDoc = ({
  data,
  ctx,
}: {
  data: IncomeReportData;
  ctx: ProposalContext;
}) => {
  const f = data.filters;
  const total = sum(data.entries, (e) => e.amount);
  const of = (t: HeadType) => data.entries.filter((e) => e.type === t);
  const byHead = data.heads
    .map((h) => ({ ...h, xs: data.entries.filter((e) => e.head === h.head) }))
    .filter((h) => h.xs.length);
  const accounts = [...new Set(data.entries.map((e) => e.account))]
    .map((account) => {
      const xs = data.entries.filter((e) => e.account === account);
      return { account, n: xs.length, amount: sum(xs, (e) => e.amount) };
    })
    .sort((a, b) => b.amount - a.amount);

  return (
    <ProposalDoc
      orientation="landscape"
      frame={{
        ...ctx,
        title: 'INCOME REPORT',
        subtitle:
          'Money the station earned outside fuel and product sales: by head, payer and Funding Account, with GST.',
        filters: [
          { label: 'Period', value: f.period },
          { label: 'Head', value: f.head },
          { label: 'Type', value: f.type, proposed: true },
          { label: 'Funding account', value: f.account },
        ],
        notes: [
          {
            text: 'Rows are Income Office Records, dated by their Entry Date (station calendar date); no Shift or Business Day. Customer Collections are not income and are left out.',
          },
          {
            text: 'Taxable and GST are the split frozen when the Income was captured; GST is intra-state (CGST + SGST). Taxable income feeds GSTR-1 (B2CS) and GSTR-3B 3.1(a).',
          },
          { text: 'Payer prints the record’s description: Income has no payer field today.' },
          {
            text: 'Type column, Direct / Indirect totals and the Type filter (marked *).',
            needs: 'Direct / Indirect flag on income heads, group B',
          },
        ],
      }}
      pages={[
        <React.Fragment key="p1">
          <KpiStrip
            items={[
              { l: 'Total income', v: rs0(total) },
              { l: 'Direct*', v: rs0(sum(of('Direct'), (e) => e.amount)) },
              { l: 'Indirect*', v: rs0(sum(of('Indirect'), (e) => e.amount)) },
              {
                l: 'Taxable at 18% GST',
                v: rs0(
                  sum(
                    data.entries.filter((e) => e.gstRate),
                    (e) => e.taxable,
                  ),
                ),
              },
              { l: 'GST collected', v: rs0(sum(data.entries, (e) => e.gst)) },
            ]}
          />
          <SectionTitle>Head-wise register</SectionTitle>
          <PTable cols={COLS} rows={incomeRows(data)} />
          <Columns>
            <Column flex={1.6}>
              <SectionTitle>Summary by head</SectionTitle>
              <PTable
                cols={HEAD_COLS}
                rows={[
                  ...byHead.map((h) => ({
                    cells: [h.head, h.type, String(h.xs.length), ...money(h.xs)],
                  })),
                  {
                    kind: 'total' as const,
                    cells: ['Total', '', String(data.entries.length), ...money(data.entries)],
                  },
                ]}
              />
            </Column>
            <Column>
              <SectionTitle>By funding account</SectionTitle>
              <PTable
                cols={ACCOUNT_COLS}
                rows={[
                  ...accounts.map((a) => ({
                    cells: [a.account, String(a.n), amt(a.amount), pct((a.amount / total) * 100)],
                  })),
                  {
                    kind: 'total' as const,
                    cells: ['Total', String(data.entries.length), amt(total), pct(100)],
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

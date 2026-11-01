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

/** One Expense Office Record: an Entry Date, a head and a Funding Account. */
export interface ExpenseLine {
  date: string;
  head: string;
  /** Group-B flag on the expense head. */
  type: HeadType;
  /** Read from the description today (no payee field yet). */
  payee: string;
  account: string;
  amount: number;
}

export interface ExpenseReportData {
  filters: { period: string; head: string; type: string; account: string };
  /** Heads in print order (Direct first), with their group-B type. */
  heads: { head: string; type: HeadType }[];
  entries: ExpenseLine[];
}

const COLS: PCol[] = [
  { header: 'Date', flex: 0.8 },
  { header: 'Head', flex: 2.1 },
  { header: 'Type', flex: 0.9, proposed: true },
  { header: 'Payee / description', flex: 3.6 },
  { header: 'Funding account', flex: 1.5 },
  { header: 'Amount (₹)', flex: 1.3, align: 'right', mono: true, strong: true },
];

/** The register: a band per head (Direct heads first), each with a subtotal; then Direct, Indirect, Grand. */
export function expenseRows(data: ExpenseReportData): PRow[] {
  const rows: PRow[] = [];
  for (const h of data.heads) {
    const inHead = data.entries.filter((e) => e.head === h.head);
    if (!inHead.length) continue;
    rows.push({
      kind: 'group',
      label: h.head,
      detail: `${h.type} · ${inHead.length} ${inHead.length === 1 ? 'entry' : 'entries'}`,
    });
    rows.push(
      ...inHead.map((e) => ({
        cells: [dShort(e.date), e.head, e.type, e.payee, e.account, amt(e.amount)],
      })),
    );
    rows.push({
      kind: 'subtotal',
      cells: [`${h.head} subtotal`, '', '', '', '', amt(sum(inHead, (e) => e.amount))],
    });
  }
  const of = (t: HeadType) => data.entries.filter((e) => e.type === t);
  rows.push({
    kind: 'subtotal',
    cells: ['Direct expenses', '', '', '', '', amt(sum(of('Direct'), (e) => e.amount))],
  });
  rows.push({
    kind: 'subtotal',
    cells: ['Indirect expenses', '', '', '', '', amt(sum(of('Indirect'), (e) => e.amount))],
  });
  rows.push({
    kind: 'total',
    cells: ['Grand total', '', '', '', '', amt(sum(data.entries, (e) => e.amount))],
  });
  return rows;
}

const HEAD_COLS: PCol[] = [
  { header: 'Head', flex: 2.4, strong: true },
  { header: 'Type', flex: 0.9, proposed: true },
  { header: 'Entries', flex: 0.7, align: 'right', mono: true },
  { header: 'Amount (₹)', flex: 1.4, align: 'right', mono: true },
  { header: 'Share', flex: 0.8, align: 'right', mono: true },
];

const ACCOUNT_COLS: PCol[] = [
  { header: 'Funding account', flex: 1.8, strong: true },
  { header: 'Entries', flex: 0.7, align: 'right', mono: true },
  { header: 'Amount (₹)', flex: 1.4, align: 'right', mono: true },
  { header: 'Share', flex: 0.8, align: 'right', mono: true },
];

export const ExpenseReportDoc = ({
  data,
  ctx,
}: {
  data: ExpenseReportData;
  ctx: ProposalContext;
}) => {
  const f = data.filters;
  const total = sum(data.entries, (e) => e.amount);
  const direct = sum(
    data.entries.filter((e) => e.type === 'Direct'),
    (e) => e.amount,
  );
  const indirect = sum(
    data.entries.filter((e) => e.type === 'Indirect'),
    (e) => e.amount,
  );
  const byHead = data.heads
    .map((h) => {
      const inHead = data.entries.filter((e) => e.head === h.head);
      return { ...h, n: inHead.length, amount: sum(inHead, (e) => e.amount) };
    })
    .filter((h) => h.n);
  const accounts = [...new Set(data.entries.map((e) => e.account))]
    .map((account) => {
      const inAcc = data.entries.filter((e) => e.account === account);
      return { account, n: inAcc.length, amount: sum(inAcc, (e) => e.amount) };
    })
    .sort((a, b) => b.amount - a.amount);
  const share = (n: number) => pct((n / total) * 100);

  return (
    <ProposalDoc
      frame={{
        ...ctx,
        title: 'EXPENSE REPORT',
        subtitle:
          'What the station spent, on which head, from which Funding Account; direct and indirect costs apart.',
        filters: [
          { label: 'Period', value: f.period },
          { label: 'Head', value: f.head },
          { label: 'Type', value: f.type, proposed: true },
          { label: 'Funding account', value: f.account },
        ],
        notes: [
          {
            text: 'Rows are Expense Office Records, dated by their Entry Date (station calendar date); they carry no Shift or Business Day and never touch a Drawer.',
          },
          {
            text: 'Payee / description prints the record’s description: Expenses have no payee field today.',
          },
          {
            text: 'Funding account is the Financial Account the money left (Cash in Hand, Petty Cash, bank). Amounts are as recorded; GST on expenses is not split out.',
          },
          {
            text: 'Type column, Direct / Indirect totals and the Type filter (marked *).',
            needs: 'Direct / Indirect flag on expense heads, group B',
          },
        ],
      }}
      pages={[
        <React.Fragment key="p1">
          <KpiStrip
            items={[
              { l: 'Total expenses', v: rs0(total) },
              { l: 'Direct*', v: rs0(direct) },
              { l: 'Indirect*', v: rs0(indirect) },
              { l: 'Entries', v: String(data.entries.length) },
              { l: 'Direct share*', v: pct((direct / total) * 100) },
            ]}
          />
          <SectionTitle>Head-wise register</SectionTitle>
          <PTable cols={COLS} rows={expenseRows(data)} />
          <Columns>
            <Column flex={1.25}>
              <SectionTitle>Summary by head</SectionTitle>
              <PTable
                cols={HEAD_COLS}
                rows={[
                  ...byHead.map((h) => ({
                    cells: [h.head, h.type, String(h.n), amt(h.amount), share(h.amount)],
                  })),
                  {
                    kind: 'subtotal' as const,
                    cells: ['Direct', '', '', amt(direct), share(direct)],
                  },
                  {
                    kind: 'subtotal' as const,
                    cells: ['Indirect', '', '', amt(indirect), share(indirect)],
                  },
                  {
                    kind: 'total' as const,
                    cells: ['Total', '', String(data.entries.length), amt(total), pct(100)],
                  },
                ]}
              />
            </Column>
            <Column>
              <SectionTitle>Summary by funding account</SectionTitle>
              <PTable
                cols={ACCOUNT_COLS}
                rows={[
                  ...accounts.map((a) => ({
                    cells: [a.account, String(a.n), amt(a.amount), share(a.amount)],
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

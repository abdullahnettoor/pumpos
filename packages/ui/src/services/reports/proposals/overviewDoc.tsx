import React from 'react';
import {
  KpiStrip,
  PTable,
  ProposalDoc,
  SectionTitle,
  type PCol,
  type ProposalContext,
} from './shared.js';

export interface OverviewReport {
  nn: string;
  name: string;
  /** Issue number the report answers. */
  issue: string;
  /** `A` buildable from stored data; `A+B` needs a group-B addition for some figures. */
  group: 'A' | 'A+B';
  purpose: string;
  filters: string;
  formats: string;
}

export interface GroupBAddition {
  addition: string;
  change: string;
  unlocks: string;
}

export interface OverviewData {
  reports: OverviewReport[];
  additions: GroupBAddition[];
}

const REPORT_COLS: PCol[] = [
  { header: '#', flex: 0.35, mono: true },
  { header: 'Report', flex: 2, strong: true },
  { header: 'Group', flex: 0.55, align: 'center' },
  { header: 'Purpose', flex: 3.4 },
  { header: 'Key filters', flex: 2.4 },
  { header: 'Export', flex: 0.9 },
];

const ADDITION_COLS: PCol[] = [
  { header: 'Group-B addition', flex: 2, strong: true },
  { header: 'Change', flex: 3.4 },
  { header: 'Unlocks', flex: 1.6 },
];

/** 00 — the index the team reviews first: every proposed report and what group B unlocks. */
export const OverviewDoc = ({ data, ctx }: { data: OverviewData; ctx: ProposalContext }) => {
  const a = data.reports.filter((r) => r.group === 'A').length;
  return (
    <ProposalDoc
      frame={{
        ...ctx,
        title: 'REPORT PROPOSALS — OVERVIEW',
        subtitle:
          'Proposed new and upgraded reports for team review. Each PDF shows every column, total and filter on realistic sample data.',
        filters: [
          { label: 'Reports', value: String(data.reports.length) },
          { label: 'Group A', value: `${a} (data already stored)` },
          {
            label: 'Group A+B',
            value: `${data.reports.length - a} (some figures need a small addition)`,
          },
          { label: 'Proposed filter / column', value: 'marked *' },
        ],
        notes: [
          {
            text: 'Group A: every figure can be built from records PumpOS already stores (snapshots, stock movements, ledger entries, party ledgers). Group A+B: the report ships with a few figures waiting on a group-B addition, shown with * and listed in that PDF’s notes.',
          },
          {
            text: 'Every report exports as PDF (these templates) and Excel/CSV (the same columns, one sheet per section). Figures are fictional: Sree Lakshmi Fuels, Kochi, Oct 2026.',
          },
          {
            text: 'Domain anchors hold everywhere: sales by Business Day + Shift, office records by Entry Date; fuel from nozzle readings and Decantation; fuel VAT never mixed into GST.',
          },
        ],
      }}
      pages={[
        <React.Fragment key="p1">
          <KpiStrip
            items={[
              { l: 'Reports proposed', v: String(data.reports.length) },
              { l: 'Group A', v: String(a) },
              { l: 'Group A+B', v: String(data.reports.length - a) },
              { l: 'Group-B additions', v: String(data.additions.length) },
            ]}
          />
          <SectionTitle>Reports</SectionTitle>
          <PTable
            cols={REPORT_COLS}
            rows={data.reports.map((r) => ({
              cells: [
                r.nn,
                { text: r.name, detail: `Issue #${r.issue}` },
                r.group,
                r.purpose,
                r.filters,
                r.formats,
              ],
            }))}
          />
          <SectionTitle>Group B — small additions and what they unlock</SectionTitle>
          <PTable
            cols={ADDITION_COLS}
            rows={data.additions.map((x) => ({ cells: [x.addition, x.change, x.unlocks] }))}
          />
        </React.Fragment>,
      ]}
    />
  );
};

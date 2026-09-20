import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import {
  C,
  s,
  TableView,
  Kpi,
  varColor,
  inr,
  vol3,
  fmtDateTime,
  LetterheadBand,
  type Col,
  type Cell,
} from './shiftSummaryDoc.js';
import type { AttendantReportSection, AttendantReportConfig } from './reportConfig.js';
import { DEFAULT_ATTENDANT_REPORT_CONFIG } from './reportConfig.js';

export type { AttendantReportSection, AttendantReportConfig } from './reportConfig.js';
export {
  DEFAULT_ATTENDANT_REPORT_CONFIG,
  ATTENDANT_REPORT_SECTION_LABELS,
} from './reportConfig.js';

/**
 * Attendant Handover Report — a per-Attendant statement for one Business-Date
 * range, built for the conversation that follows a persistent shortage. Every
 * figure comes from closed Shifts, so the document never restates later.
 *
 * `data` is one attendant entry from the report plus its period meta.
 */

const shiftLabel = (shift: any): string =>
  `${shift.businessDate}${shift.shiftTemplateName ? ` · ${shift.shiftTemplateName}` : ''}`;

const sum = (rows: any[], get: (r: any) => number): number =>
  rows.reduce((acc, r) => acc + Number(get(r) || 0), 0);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Text style={s.h2}>{children}</Text>
);

const builders: Record<
  AttendantReportSection,
  (d: any, cfg: AttendantReportConfig) => React.ReactNode
> = {
  header: (d, cfg) => (
    <View key="header">
      <LetterheadBand
        title="ATTENDANT HANDOVER REPORT"
        stationName={cfg.stationName}
        letterhead={cfg.letterhead}
        showLogo={cfg.showLogo}
      />
      <Text style={s.sub}>
        {d.attendantName} • {d.from} to {d.to}
        {d.generatedAt ? ` • Generated ${fmtDateTime(d.generatedAt)}` : ''}
      </Text>
      <Text style={s.sub}>
        Closed shifts only. Sales components are listed separately; fuel expected is metered from
        nozzle readings and is not a grand total.
      </Text>
    </View>
  ),

  summary: (d) => (
    <View key="summary" style={s.kpiRow}>
      <Kpi l="Shifts" v={String(d.shiftsWorked ?? 0)} />
      <Kpi l="Cash handed over" v={inr(d.totals?.cashHandedOver)} />
      <Kpi
        l="Card + UPI"
        v={inr((d.totals?.cardHandedOver ?? 0) + (d.totals?.upiHandedOver ?? 0))}
      />
      <Kpi
        l="Net variance"
        v={inr(d.totals?.varianceAmount)}
        c={varColor(Number(d.totals?.varianceAmount ?? 0))}
      />
    </View>
  ),

  fuelSales: (d) => {
    const shifts = d.shifts ?? [];
    if (shifts.length === 0) return null;
    const columns: Col[] = [
      { header: 'Shift', flex: 2.2 },
      { header: 'Dispenser', flex: 1.6 },
      { header: 'Nozzle', flex: 1.2 },
      { header: 'Volume', flex: 1.2, align: 'right', mono: true },
      { header: 'Testing', flex: 1.1, align: 'right', mono: true },
      { header: 'Fuel expected', flex: 1.5, align: 'right', mono: true, strong: true },
    ];
    const rows: Cell[][] = [];
    for (const shift of shifts) {
      for (const du of shift.dispensers ?? []) {
        const nozzles = du.nozzles ?? [];
        if (nozzles.length === 0) {
          rows.push([
            { text: shiftLabel(shift) },
            { text: du.duName },
            { text: '—' },
            { text: '—' },
            { text: vol3(du.testingVolume) },
            { text: inr(du.expectedFuelSales) },
          ]);
          continue;
        }
        nozzles.forEach((n: any, i: number) => {
          rows.push([
            { text: i === 0 ? shiftLabel(shift) : '' },
            { text: i === 0 ? du.duName : '' },
            { text: `${n.nozzleName}${n.productName ? ` (${n.productName})` : ''}` },
            { text: vol3(n.volumeSold) },
            { text: vol3(n.testingVolume) },
            { text: i === 0 ? inr(du.expectedFuelSales) : '' },
          ]);
        });
      }
    }
    return (
      <View key="fuelSales" wrap={false}>
        <SectionTitle>Fuel Sales by Shift</SectionTitle>
        <TableView
          columns={columns}
          rows={rows}
          total={[
            { text: 'Total' },
            { text: '' },
            { text: '' },
            { text: '' },
            { text: '' },
            { text: inr(d.totals?.expectedFuelSales) },
          ]}
        />
      </View>
    );
  },

  merchandise: (d) => {
    const shifts = d.shifts ?? [];
    if (shifts.length === 0) return null;
    const columns: Col[] = [
      { header: 'Shift', flex: 2.5 },
      { header: 'Billed sales', flex: 1.5, align: 'right', mono: true },
      { header: 'Handover product sales', flex: 2, align: 'right', mono: true },
    ];
    return (
      <View key="merchandise" wrap={false}>
        <SectionTitle>Merchandise</SectionTitle>
        <TableView
          columns={columns}
          rows={shifts.map((shift: any) => [
            { text: shiftLabel(shift) },
            { text: inr(shift.billedSales) },
            { text: inr(shift.handoverProductSales) },
          ])}
          total={[
            { text: 'Total' },
            { text: inr(d.totals?.billedSales) },
            { text: inr(d.totals?.handoverProductSales) },
          ]}
        />
      </View>
    );
  },

  creditSales: (d) => {
    const shifts = (d.shifts ?? []).filter((sh: any) => Number(sh.creditSales || 0) !== 0);
    if (shifts.length === 0) return null;
    return (
      <View key="creditSales" wrap={false}>
        <SectionTitle>Fuel-on-Credit Sales</SectionTitle>
        <TableView
          columns={[
            { header: 'Shift', flex: 3 },
            { header: 'Credit sales', flex: 1.5, align: 'right', mono: true },
          ]}
          rows={shifts.map((shift: any) => [
            { text: shiftLabel(shift) },
            { text: inr(shift.creditSales) },
          ])}
          total={[{ text: 'Total' }, { text: inr(d.totals?.creditSales) }]}
        />
      </View>
    );
  },

  terminals: (d) => {
    const rows: Cell[][] = [];
    for (const shift of d.shifts ?? []) {
      for (const du of shift.dispensers ?? []) {
        for (const t of du.terminals ?? []) {
          rows.push([
            { text: shiftLabel(shift) },
            { text: du.duName },
            { text: t.terminalName },
            { text: t.batchRef || '—' },
            { text: inr(t.cardAmount) },
            { text: inr(t.upiAmount) },
          ]);
        }
      }
    }
    if (rows.length === 0) return null;
    return (
      <View key="terminals" wrap={false}>
        <SectionTitle>Payment Terminals</SectionTitle>
        <TableView
          columns={[
            { header: 'Shift', flex: 2 },
            { header: 'Dispenser', flex: 1.4 },
            { header: 'Terminal', flex: 1.6 },
            { header: 'Batch', flex: 1.2 },
            { header: 'Card', flex: 1.2, align: 'right', mono: true },
            { header: 'UPI', flex: 1.2, align: 'right', mono: true },
          ]}
          rows={rows}
        />
      </View>
    );
  },

  variance: (d) => {
    const shifts = d.shifts ?? [];
    if (shifts.length === 0) return null;
    return (
      <View key="variance" wrap={false}>
        <SectionTitle>Variance by Shift</SectionTitle>
        <TableView
          columns={[
            { header: 'Shift', flex: 2.4 },
            { header: 'Cash', flex: 1.2, align: 'right', mono: true },
            { header: 'Card', flex: 1.2, align: 'right', mono: true },
            { header: 'UPI', flex: 1.2, align: 'right', mono: true },
            { header: 'Variance', flex: 1.3, align: 'right', mono: true, strong: true },
          ]}
          rows={shifts.map((shift: any) => [
            { text: shiftLabel(shift) },
            { text: inr(shift.cashHandedOver) },
            { text: inr(shift.cardHandedOver) },
            { text: inr(shift.upiHandedOver) },
            {
              text: inr(shift.varianceAmount),
              color: varColor(Number(shift.varianceAmount || 0)),
            },
          ])}
          total={[
            { text: 'Net' },
            { text: inr(sum(shifts, (sh) => sh.cashHandedOver)) },
            { text: inr(sum(shifts, (sh) => sh.cardHandedOver)) },
            { text: inr(sum(shifts, (sh) => sh.upiHandedOver)) },
            {
              text: inr(d.totals?.varianceAmount),
              color: varColor(Number(d.totals?.varianceAmount ?? 0)),
            },
          ]}
        />
      </View>
    );
  },

  signature: (d) => (
    <View key="signature" wrap={false} style={{ marginTop: 18 }}>
      <SectionTitle>Acknowledgement</SectionTitle>
      <Text style={{ fontSize: 8.5, color: C.body, marginBottom: 20 }}>
        Net variance for {d.attendantName} from {d.from} to {d.to}: {inr(d.totals?.varianceAmount)}.
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
        {['Attendant', 'Manager'].map((role) => (
          <View key={role} style={{ width: '45%' }}>
            <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 4 }}>
              <Text style={{ fontSize: 8, color: C.muted }}>{role} signature &amp; date</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  ),
};

export const AttendantReportDoc: React.FC<{
  data: any;
  config?: AttendantReportConfig;
}> = ({ data, config = DEFAULT_ATTENDANT_REPORT_CONFIG }) => (
  <Document>
    <Page size={config.paper} style={s.page}>
      {config.sections.map((key) => builders[key]?.(data, config))}
      <View style={s.foot} fixed>
        <Text>Generated {new Date().toLocaleString('en-IN')}</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  </Document>
);

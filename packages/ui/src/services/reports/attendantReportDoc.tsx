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
import type { AttendantReportDispenser, AttendantReportShift } from '@pump/shared';
import type { AttendantStatementData } from './attendantStatementData.js';
import { sliceAttendantStatementByDay } from './attendantStatementDays.js';
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
 */
export type { AttendantStatementData };

const shiftLabel = (shift: AttendantReportShift): string =>
  `${shift.businessDate}${shift.shiftTemplateName ? ` · ${shift.shiftTemplateName}` : ''}`;

const sum = <T,>(rows: T[], get: (row: T) => number): number =>
  rows.reduce((acc, row) => acc + Number(get(row) || 0), 0);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Text style={s.h2}>{children}</Text>
);

const builders: Record<
  AttendantReportSection,
  (d: AttendantStatementData, cfg: AttendantReportConfig) => React.ReactNode
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
        {` • Generated ${fmtDateTime(d.generatedAt)}`}
      </Text>
      <Text style={s.sub}>
        Closed shifts only. Sales components are listed separately; fuel expected is metered from
        nozzle readings and is not a grand total.
      </Text>
    </View>
  ),

  summary: (d) => (
    <View key="summary" style={s.kpiRow}>
      <Kpi l="Shifts" v={String(d.shiftsWorked)} />
      <Kpi l="Cash handed over" v={inr(d.totals.cashHandedOver)} />
      <Kpi l="Card + UPI" v={inr(d.totals.cardHandedOver + d.totals.upiHandedOver)} />
      <Kpi
        l="Net variance"
        v={inr(d.totals.varianceAmount)}
        c={varColor(d.totals.varianceAmount)}
      />
    </View>
  ),

  fuelSales: (d) => {
    const shifts = d.shifts;
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
      for (const du of shift.dispensers) {
        const nozzles = du.nozzles;
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
        nozzles.forEach((n, i) => {
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
            { text: inr(d.totals.expectedFuelSales) },
          ]}
        />
      </View>
    );
  },

  merchandise: (d) => {
    const shifts = d.shifts;
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
          rows={shifts.map((shift) => [
            { text: shiftLabel(shift) },
            { text: inr(shift.billedSales) },
            { text: inr(shift.handoverProductSales) },
          ])}
          total={[
            { text: 'Total' },
            { text: inr(d.totals.billedSales) },
            { text: inr(d.totals.handoverProductSales) },
          ]}
        />
      </View>
    );
  },

  creditSales: (d) => {
    const shifts = d.shifts.filter((sh) => sh.creditSales !== 0 || sh.creditSaleLines.length > 0);
    if (shifts.length === 0) return null;
    /*
     * One row per chit, not per shift: the operator chasing a receivable needs
     * the name behind the number. A shift can carry a credit total with no
     * chits under it — a back-office entry raised against the shift outside
     * any attendant's handover — and it still prints its own row, so the
     * section total never loses money the shift line accounted for.
     */
    const rows: Cell[][] = [];
    for (const shift of shifts) {
      if (shift.creditSaleLines.length === 0) {
        rows.push([
          { text: shiftLabel(shift) },
          { text: '—' },
          { text: '—' },
          { text: '—' },
          { text: inr(shift.creditSales) },
        ]);
        continue;
      }
      for (const line of shift.creditSaleLines) {
        rows.push([
          { text: shiftLabel(shift) },
          { text: line.customerName || 'Unknown customer' },
          { text: line.vehicleRegistration || '—' },
          {
            text: line.productName
              ? `${line.productName}${line.quantity != null ? ` · ${vol3(line.quantity)}` : ''}`
              : '—',
          },
          { text: inr(line.amount) },
        ]);
      }
    }
    return (
      <View key="creditSales" wrap={false}>
        <SectionTitle>Fuel-on-Credit Sales</SectionTitle>
        <TableView
          columns={[
            { header: 'Shift', flex: 2.5 },
            { header: 'Customer', flex: 2.5 },
            { header: 'Vehicle', flex: 1.5 },
            { header: 'Product', flex: 2 },
            { header: 'Amount', flex: 1.5, align: 'right', mono: true },
          ]}
          rows={rows}
          total={[
            { text: 'Total' },
            { text: '' },
            { text: '' },
            { text: '' },
            { text: inr(d.totals.creditSales) },
          ]}
        />
      </View>
    );
  },

  terminals: (d) => {
    const rows: Cell[][] = [];
    for (const shift of d.shifts) {
      for (const du of shift.dispensers) {
        for (const t of du.terminals) {
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
    const shifts = d.shifts;
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
          rows={shifts.map((shift) => [
            { text: shiftLabel(shift) },
            { text: inr(shift.cashHandedOver) },
            { text: inr(shift.cardHandedOver) },
            { text: inr(shift.upiHandedOver) },
            {
              text: inr(shift.varianceAmount),
              color: varColor(shift.varianceAmount),
            },
          ])}
          total={[
            { text: 'Net' },
            { text: inr(sum(shifts, (sh) => sh.cashHandedOver)) },
            { text: inr(sum(shifts, (sh) => sh.cardHandedOver)) },
            { text: inr(sum(shifts, (sh) => sh.upiHandedOver)) },
            {
              text: inr(d.totals.varianceAmount),
              color: varColor(d.totals.varianceAmount),
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

/**
 * Where each section belongs once a statement paginates by day.
 *
 * `cover` describes the range as a whole, `day` describes one day's shifts,
 * and `variance` is `both` — the cover carries the net figure the recovery
 * conversation opens with, each day carries its own. Exhaustive by type, so a
 * new section fails to compile until it has been placed.
 */
const SECTION_PLACEMENT: Record<AttendantReportSection, 'cover' | 'day' | 'both'> = {
  header: 'cover',
  summary: 'cover',
  signature: 'cover',
  fuelSales: 'day',
  merchandise: 'day',
  creditSales: 'day',
  terminals: 'day',
  variance: 'both',
};

const placedOn = (where: 'cover' | 'day') => (key: AttendantReportSection) =>
  SECTION_PLACEMENT[key] === where || SECTION_PLACEMENT[key] === 'both';

/** A day page's own title — larger than a section head, it is the page's subject. */
const dayTitle = { fontSize: 13, color: C.ink, fontWeight: 700 as const, marginBottom: 2 };

const PageFooter: React.FC<{ generatedAt: string }> = ({ generatedAt }) => (
  <View style={s.foot} fixed>
    {/* The instant the report was composed — a re-print must not claim to
        be newer than the data it prints. */}
    <Text>Generated {fmtDateTime(generatedAt)}</Text>
    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
  </View>
);

/**
 * Attendant statement.
 *
 * One Business Day reads as one document — so a single-day export stays a
 * single flow, and a range is cut into a page per day behind a cover carrying
 * the range's collective figures. The day pages are the same statement
 * sections pointed at one day's shifts (see `sliceAttendantStatementByDay`),
 * so a figure never has two renderers that could drift apart.
 */
export const AttendantReportDoc: React.FC<{
  data: AttendantStatementData;
  config?: AttendantReportConfig;
}> = ({ data, config = DEFAULT_ATTENDANT_REPORT_CONFIG }) => {
  const days = sliceAttendantStatementByDay(data);

  if (days.length <= 1) {
    return (
      <Document>
        <Page size={config.paper} style={s.page}>
          {config.sections.map((key) => builders[key]?.(data, config))}
          <PageFooter generatedAt={data.generatedAt} />
        </Page>
      </Document>
    );
  }

  const daySections = config.sections.filter(placedOn('day'));
  const coverSections = config.sections.filter(placedOn('cover'));

  return (
    <Document>
      <Page size={config.paper} style={s.page}>
        {coverSections
          .filter((key) => key !== 'signature')
          .map((key) => builders[key]?.(data, config))}
        <View style={{ marginTop: 12 }}>
          <Text style={s.h2}>Days in this statement</Text>
          <Text style={s.sub}>
            {days.length} business days · one page each, from {days[0].businessDate} to{' '}
            {days[days.length - 1].businessDate}.
          </Text>
        </View>
        {/* Signed at the end of the cover: the acknowledgement is of the
            period's net variance, not of any one day. */}
        {coverSections.includes('signature') ? builders.signature?.(data, config) : null}
        <PageFooter generatedAt={data.generatedAt} />
      </Page>

      {days.map((day) => (
        <Page key={day.businessDate} size={config.paper} style={s.page}>
          <View>
            <Text style={dayTitle}>{day.businessDate}</Text>
            <Text style={s.sub}>
              {data.attendantName} · {day.data.shiftsWorked}{' '}
              {day.data.shiftsWorked === 1 ? 'shift' : 'shifts'} · net variance{' '}
              {inr(day.data.totals.varianceAmount)}
            </Text>
          </View>
          {daySections.map((key) => builders[key]?.(day.data, config))}
          <PageFooter generatedAt={data.generatedAt} />
        </Page>
      ))}
    </Document>
  );
};

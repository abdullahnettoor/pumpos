import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import type {
  DecantationReport,
  DecantationReportProductTotal,
  DecantationReportVisit,
} from '@pump/shared';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { formatStockVariance } from '../../utils/variance.js';
import { linkState, litres, transitText } from '../../components/reports/decantation/vocabulary.js';
import {
  C,
  s,
  TableView,
  Kpi,
  LetterheadBand,
  varColor,
  type Cell,
  type Col,
  type Letterhead,
} from './shiftSummaryDoc.js';

export interface DecantationReportDocProps {
  report: DecantationReport;
  stationName?: string;
  letterhead?: Letterhead;
  showLogo?: boolean;
  paper?: 'A4' | 'LETTER';
}

const signedLitres = (v: number) => formatStockVariance(v, 'L');

/** The products a visit unloaded, by code: `MS · HSD`. */
const visitProducts = (v: DecantationReportVisit): string =>
  [...new Set(v.tankLines.map((l) => l.productCode).filter(Boolean))].join(' · ') || '—';

/**
 * A visit's settled variance, or the word for why it has none yet: the first
 * unsettled link (pending, settling, not linked) names it.
 */
function visitVariance(v: DecantationReportVisit): Cell {
  if (v.totalVarianceQty != null) {
    return { text: signedLitres(v.totalVarianceQty), color: varColor(v.totalVarianceQty, 'stock') };
  }
  const waiting = v.invoiceLinks.map(linkState).find(Boolean);
  return { text: waiting?.label ?? '—', color: C.muted };
}

/** Invoice litres of the settled invoices a visit belongs to; `—` when none has settled. */
const visitInvoiceQty = (v: DecantationReportVisit): string =>
  v.invoiceLinks.some((l) => l.status === 'LINKED') ? litres(v.totalInvoiceQty) : '—';

function visitTransit(v: DecantationReportVisit): Cell {
  if (v.chambers.length === 0) return { text: '—', color: C.muted };
  if (!v.chamberSummary.hasTransitDiscrepancy) return { text: 'OK' };
  return { text: transitText(v) || 'Discrepancy', color: C.danger };
}

const VISIT_COLUMNS: Col[] = [
  { header: 'Date', flex: 1.1 },
  { header: 'Tanker', flex: 1.6, strong: true },
  { header: 'Product', flex: 0.9 },
  { header: 'Invoice', flex: 1.2, align: 'right', mono: true },
  { header: 'Received', flex: 1.2, align: 'right', mono: true },
  { header: 'Variance', flex: 1.2, align: 'right', mono: true },
  { header: 'Transit', flex: 1.6 },
];

/**
 * The visits table, cell by cell, and its total line (the server's totals, so
 * an invoice split across visits is counted once). Exported for the test.
 */
export function decantationVisitTable(report: DecantationReport): {
  rows: Cell[][];
  total: Cell[];
} {
  const t = report.totals;
  const rows = report.visits.map((v): Cell[] => [
    { text: formatDate(v.date) },
    {
      text: v.tankerNumber,
      detail: [v.documentNumber, v.driverName].filter(Boolean).join(' · '),
    },
    { text: visitProducts(v) },
    { text: visitInvoiceQty(v) },
    { text: litres(v.totalReceivedQty) },
    visitVariance(v),
    visitTransit(v),
  ]);
  const total: Cell[] = [
    { text: 'Total' },
    { text: `${t.totalVisits} ${t.totalVisits === 1 ? 'visit' : 'visits'}` },
    { text: '' },
    { text: litres(t.totalInvoiceQty) },
    { text: litres(t.totalReceivedQty) },
    { text: signedLitres(t.totalVarianceQty), color: varColor(t.totalVarianceQty, 'stock') },
    {
      text: `${t.transitDiscrepancies} ${t.transitDiscrepancies === 1 ? 'discrepancy' : 'discrepancies'}`,
      color: t.transitDiscrepancies > 0 ? C.danger : C.ink,
    },
  ];
  return { rows, total };
}

const PRODUCT_COLUMNS: Col[] = [
  { header: 'Product', flex: 1.8, strong: true },
  { header: 'Received (settled)', flex: 1.3, align: 'right', mono: true },
  { header: 'Invoiced (settled)', flex: 1.3, align: 'right', mono: true },
  { header: 'Net variance', flex: 1.2, align: 'right', mono: true },
  { header: 'Not yet settled', flex: 1.3, align: 'right', mono: true },
];

const productRow = (p: DecantationReportProductTotal): Cell[] => [
  { text: p.productName, detail: p.productCode },
  { text: litres(p.settledReceivedQty) },
  { text: litres(p.totalInvoiceQty) },
  { text: signedLitres(p.totalVarianceQty), color: varColor(p.totalVarianceQty, 'stock') },
  { text: p.pendingReceivedQty > 0 ? litres(p.pendingReceivedQty) : '—' },
];

/**
 * Decantation report as a vector PDF (#531): the station and period, the
 * summary figures, totals by product and one row per tanker visit. Printing
 * goes through this document, so Print works on desktop, where
 * `window.print()` does nothing.
 */
export const DecantationReportDoc: React.FC<DecantationReportDocProps> = ({
  report,
  stationName,
  letterhead,
  showLogo = true,
  paper = 'A4',
}) => {
  const t = report.totals;
  const visits = decantationVisitTable(report);
  const name = stationName ?? report.stationName;
  return (
    <Document>
      <Page size={paper} style={s.page}>
        <LetterheadBand
          title="DECANTATION REPORT"
          stationName={name}
          letterhead={letterhead}
          showLogo={showLogo}
        />
        <Text style={s.sub}>
          {[
            name,
            `${formatDate(report.from)} \u2013 ${formatDate(report.to)}`,
            `Generated ${formatDateTime(report.generatedAt)}`,
          ]
            .filter(Boolean)
            .join(' \u2022 ')}
        </Text>

        <View style={s.kpiRow}>
          <Kpi l="Tanker visits" v={String(t.totalVisits)} />
          <Kpi l="Volume received" v={litres(t.totalReceivedQty)} />
          <Kpi l="Settled invoice volume" v={litres(t.totalInvoiceQty)} />
          <Kpi
            l="Settled invoice variance"
            v={signedLitres(t.totalVarianceQty)}
            c={varColor(t.totalVarianceQty, 'stock') === C.danger ? C.danger : C.ink}
          />
          <Kpi
            l="Transit discrepancies"
            v={String(t.transitDiscrepancies)}
            c={t.transitDiscrepancies > 0 ? C.danger : C.ink}
          />
        </View>
        <Text style={s.sub}>
          {`${t.measuredVisits} measured \u00b7 ${t.pendingVisits} pending \u00b7 ` +
            `${litres(t.pendingInvoiceQty)} invoiced, not yet settled \u00b7 ` +
            `${t.totalChambersShort} short \u00b7 ${t.totalChambersExcess} excess \u00b7 ` +
            `${t.totalSealsBroken} broken seals \u00b7 ${t.totalChambersNotEmptied} unemptied`}
        </Text>

        {report.productTotals.length > 0 && (
          <>
            <Text style={s.h2}>TOTALS BY PRODUCT</Text>
            <TableView columns={PRODUCT_COLUMNS} rows={report.productTotals.map(productRow)} />
          </>
        )}

        <Text style={s.h2}>TANKER VISITS</Text>
        {report.visits.length === 0 ? (
          <Text style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
            No tanker visits in this period.
          </Text>
        ) : (
          <TableView columns={VISIT_COLUMNS} rows={visits.rows} total={visits.total} />
        )}
        <Text style={[s.sub, { marginTop: 8 }]}>
          Variance is the settled invoice&apos;s: received across all its visits against the
          invoice. Transit counts chambers short or in excess, broken seals and unemptied
          compartments.
        </Text>

        <View style={s.foot} fixed>
          <Text>Generated by PumpOS</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};

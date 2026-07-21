import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import {
  C, s, TableView, Kpi, varColor, inr, inr0, vol3, vol3u, unitTotals, fmtDateTime, LetterheadBand,
  type Col, type Cell,
} from './shiftSummaryDoc.js';
import type { DssrSection, DssrReportConfig } from './reportConfig.js';
import { DEFAULT_DSSR_CONFIG } from './reportConfig.js';

export type { DssrSection, DssrReportConfig } from './reportConfig.js';
export { DEFAULT_DSSR_CONFIG, DSSR_SECTION_LABELS } from './reportConfig.js';

const ReconRow = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <View style={s.reconRow}>
    <Text style={{ fontSize: 8.5, color: C.body }}>{label}</Text>
    <Text style={{ fontSize: 8.5, fontFamily: 'Geist Mono', color: color ?? C.ink, fontWeight: 700 }}>{value}</Text>
  </View>
);

const builders: Record<DssrSection, (d: any, cfg: DssrReportConfig) => React.ReactNode> = {
  header: (d, cfg) => (
    <View key="header">
      <LetterheadBand title="DAILY SALES SUMMARY RECORD" stationName={cfg.stationName} letterhead={cfg.letterhead} />
      <Text style={s.sub}>
        Business Date {d.businessDate}{d.generatedAt ? ` \u2022 Generated ${fmtDateTime(d.generatedAt)}` : ''}
      </Text>
    </View>
  ),
  meta: (d) => {
    const f = d.fuel || {};
    const bp = (f.byProduct || []) as any[];
    const gross = Number(f.totalGrossVolume ?? f.totalVolume ?? 0);
    const testing = Number(f.totalTestingVolume || 0);
    const net = Number(f.totalNetVolume ?? gross - testing);
    return (
      <View key="meta" style={s.metaBox}>
        <View style={s.metaCell}><Text style={s.label}>SHIFTS INCLUDED</Text><Text style={s.val}>{d.shiftsIncluded ?? 0}</Text></View>
        <View style={s.metaCell}><Text style={s.label}>NET FUEL VOLUME</Text><Text style={s.valMono}>{bp.length ? unitTotals(bp, (p) => Number(p.netVolume || 0)) : vol3(net)}</Text></View>
        <View style={s.metaCell}><Text style={s.label}>GROSS / TESTING</Text><Text style={s.valMono}>{bp.length ? `${unitTotals(bp, (p) => Number(p.grossVolume || 0))} / ${unitTotals(bp, (p) => Number(p.testingVolume || 0))}` : `${vol3(gross)} / ${vol3(testing)}`}</Text></View>
        <View style={s.metaCell}><Text style={s.label}>FUEL SALES</Text><Text style={s.valMono}>{inr0(f.totalSalesValue)}</Text></View>
      </View>
    );
  },
  kpis: (d) => {
    const col = d.collections || {};
    const credit = d.credit || {};
    return (
      <View key="kpis" style={s.kpiRow}>
        <Kpi l="Total Collections" v={inr0(col.total)} c={C.success} />
        <Kpi l="Cash Collections" v={inr0(col.Cash)} c={C.ink} />
        <Kpi l="Credit (Normal + Fleet)" v={inr0(Number(credit.normalCredit || 0) + Number(credit.fleetCredit || 0))} c={C.amber} />
      </View>
    );
  },
  financial: (d) => {
    const col = d.collections || {};
    const credit = d.credit || {};
    const exp = d.expenses || {};
    const inc = d.income || {};
    const pur = d.purchases || {};
    const sup = d.supplierPayments || {};
    const merch = d.merchandise || {};
    return (
      <View key="financial">
        <Text style={s.h2}>FINANCIAL SUMMARY</Text>
        <View style={s.reconBox}>
          <ReconRow label="Cash Collections" value={inr(col.Cash)} />
          <ReconRow label="Card Collections" value={inr(col.Card)} />
          <ReconRow label="UPI Collections" value={inr(col.UPI)} />
          <ReconRow label="Bank Transfer Collections" value={inr(col.BankTransfer)} />
          <ReconRow label="Merchandise Sales" value={inr(merch.salesValue)} />
          <ReconRow label="Normal Credit Sales" value={inr(credit.normalCredit)} color={C.amber} />
          <ReconRow label="Fleet Credit Sales" value={inr(credit.fleetCredit)} color={C.amber} />
          <ReconRow label="Purchases" value={inr(pur.total)} />
          <ReconRow label="Supplier Payments (Drawer / Bank)" value={`${inr(sup.drawer)} / ${inr(sup.bank)}`} />
          <ReconRow label="Drawer Expenses" value={inr(exp.drawer)} />
          <ReconRow label="Business Expenses" value={inr(exp.business)} />
          <ReconRow label="Total Expenses" value={inr(exp.total)} color={C.danger} />
          {Number(inc.total || 0) > 0 && <ReconRow label="Other Income (Cash / Bank)" value={`${inr(inc.drawer)} / ${inr(inc.business)}`} color={C.green} />}
        </View>
      </View>
    );
  },
  fuelByProduct: (d) => {
    const f = d.fuel || {};
    const list = (f.byProduct || []) as any[];
    if (list.length === 0) return null;
    const rows: Cell[][] = list.map((p) => [
      { text: `${p.productName || 'Unknown'}${p.productCode ? ` (${p.productCode})` : ''}` },
      { text: vol3u(p.grossVolume, p.unit) },
      { text: vol3u(p.testingVolume, p.unit), color: Number(p.testingVolume || 0) > 0 ? C.amber : C.muted },
      { text: vol3u(p.netVolume, p.unit) },
      { text: inr(p.salesValue) },
    ]);
    const cols: Col[] = [
      { header: 'Product', flex: 2.2, strong: true },
      { header: 'Gross', flex: 1.2, align: 'right', mono: true },
      { header: 'Testing', flex: 1.1, align: 'right', mono: true },
      { header: 'Net', flex: 1.2, align: 'right', mono: true, strong: true },
      { header: 'Sales Value', flex: 1.6, align: 'right', mono: true },
    ];
    return (
      <View key="fuelByProduct">
        <Text style={s.h2}>FUEL SALES BY PRODUCT</Text>
        <TableView columns={cols} rows={rows} totals={Array.from(new Set<string>(list.map((p) => String(p.unit || 'L')))).map((u) => {
          const pu = list.filter((p) => (p.unit || 'L') === u);
          return [
            { text: `TOTAL \u2014 ${u}` },
            { text: vol3u(pu.reduce((a, p) => a + Number(p.grossVolume || 0), 0), u), color: C.muted },
            { text: vol3u(pu.reduce((a, p) => a + Number(p.testingVolume || 0), 0), u), color: C.muted },
            { text: vol3u(pu.reduce((a, p) => a + Number(p.netVolume || 0), 0), u), color: C.green },
            { text: inr(pu.reduce((a, p) => a + Number(p.salesValue || 0), 0)), color: C.ink },
          ];
        })} />
      </View>
    );
  },
  nozzles: (d) => {
    const list = (d.fuel?.nozzles || []) as any[];
    if (list.length === 0) return null;
    const rows: Cell[][] = list.map((nz) => [
      { text: nz.nozzleName || 'Unknown' },
      { text: nz.productName || 'Unknown' },
      { text: vol3u(nz.grossVolume, nz.unit) },
      { text: vol3u(nz.testingVolume, nz.unit), color: Number(nz.testingVolume || 0) > 0 ? C.amber : C.muted },
      { text: vol3u(nz.netVolume, nz.unit) },
    ]);
    const cols: Col[] = [
      { header: 'Nozzle', flex: 1.3, strong: true }, { header: 'Product', flex: 2 },
      { header: 'Gross', flex: 1.2, align: 'right', mono: true }, { header: 'Testing', flex: 1.1, align: 'right', mono: true },
      { header: 'Net', flex: 1.2, align: 'right', mono: true, strong: true },
    ];
    return (
      <View key="nozzles"><Text style={s.h2}>NOZZLE AGGREGATION</Text><TableView columns={cols} rows={rows} /></View>
    );
  },
  fuelStockVariance: (d) => {
    const list = (d.fuelStockVariance || []) as any[];
    if (list.length === 0) return null;
    const rows: Cell[][] = list.map((v) => {
      const variance = Number(v.varianceQuantity || 0);
      return [
        { text: v.tankName || 'Unknown' }, { text: v.productName || 'Unknown' },
        { text: vol3u(v.expectedQuantity, v.unit) }, { text: vol3u(v.actualQuantity, v.unit) },
        { text: `${variance > 0 ? '+' : ''}${vol3u(variance, v.unit)}`, color: varColor(variance) },
        { text: v.status || '-', color: varColor(variance) },
      ];
    });
    const cols: Col[] = [
      { header: 'Tank', flex: 1.3, strong: true }, { header: 'Product', flex: 1.6 },
      { header: 'Book', flex: 1.3, align: 'right', mono: true }, { header: 'Dip', flex: 1.3, align: 'right', mono: true },
      { header: 'Variance', flex: 1.3, align: 'right', mono: true }, { header: 'Status', flex: 1 },
    ];
    return (
      <View key="fuelStockVariance"><Text style={s.h2}>TANK DIP &amp; FUEL STOCK VARIANCE</Text><TableView columns={cols} rows={rows} /></View>
    );
  },
  merchandiseStockVariance: (d) => {
    const list = (d.merchandiseStockVariance || []) as any[];
    if (list.length === 0) return null;
    const rows: Cell[][] = list.map((v) => {
      const variance = Number(v.varianceQuantity || 0);
      return [
        { text: v.productName || 'Unknown' }, { text: v.unit || '-' },
        { text: String(Number(v.expectedQuantity || 0).toLocaleString('en-IN')) },
        { text: String(Number(v.actualQuantity || 0).toLocaleString('en-IN')) },
        { text: `${variance > 0 ? '+' : ''}${Number(variance).toLocaleString('en-IN')}`, color: varColor(variance) },
        { text: v.status || '-', color: varColor(variance) },
      ];
    });
    const cols: Col[] = [
      { header: 'Product', flex: 2, strong: true }, { header: 'Unit', flex: 1 },
      { header: 'Book', flex: 1.2, align: 'right', mono: true }, { header: 'Counted', flex: 1.2, align: 'right', mono: true },
      { header: 'Variance', flex: 1.2, align: 'right', mono: true }, { header: 'Status', flex: 1 },
    ];
    return (
      <View key="merchandiseStockVariance"><Text style={s.h2}>MERCHANDISE STOCK VARIANCE (UNITS)</Text><TableView columns={cols} rows={rows} /></View>
    );
  },
  shifts: (d) => {
    const list = (d.shifts || []) as any[];
    if (list.length === 0) return null;
    const rows: Cell[][] = list.map((sh) => {
      const v = Number(sh.cashVariance || 0);
      return [
        { text: `${String(sh.shiftId || '').slice(0, 8)}\u2026` },
        { text: sh.templateName || 'Custom' },
        { text: sh.closedAt ? fmtDateTime(sh.closedAt) : '-' },
        { text: vol3(sh.netVolume) },
        { text: `${v > 0 ? '+' : ''}${inr(v)}`, color: varColor(v) },
      ];
    });
    const cols: Col[] = [
      { header: 'Shift', flex: 1.2, mono: true, strong: true }, { header: 'Template', flex: 1.6 },
      { header: 'Closed At', flex: 2 }, { header: 'Net Volume', flex: 1.3, align: 'right', mono: true },
      { header: 'Cash Variance', flex: 1.4, align: 'right', mono: true },
    ];
    return (
      <View key="shifts"><Text style={s.h2}>INCLUDED SHIFTS</Text><TableView columns={cols} rows={rows} /></View>
    );
  },
};

/**
 * Daily Sales Summary Record (DSSR) as a branded, mono-numeric react-pdf
 * document. Reuses the shift-summary primitive kit (fonts, table, KPIs) so both
 * reports stay visually identical. Reads the immutable DSSR snapshot.
 */
export const DssrDoc: React.FC<{ dssr: any; config?: DssrReportConfig }> = ({ dssr, config = DEFAULT_DSSR_CONFIG }) => {
  const d = { ...(dssr?.snapshotData || {}), businessDate: dssr?.businessDate, generatedAt: dssr?.generatedAt };
  return (
    <Document>
      <Page size={config.paper} style={s.page}>
        {config.sections.map((key) => builders[key]?.(d, config))}
        <View style={s.foot} fixed>
          <Text>Generated {new Date().toLocaleString('en-IN')}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};

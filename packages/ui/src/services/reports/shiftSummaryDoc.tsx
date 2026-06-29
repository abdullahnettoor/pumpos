import React from 'react';
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer';

// Embed IBM Plex Sans (matches the app type + includes the rupee glyph). TTFs
// are vendored locally via scripts/download-fonts.mjs and served from /fonts.
Font.register({
  family: 'IBM Plex Sans',
  fonts: [
    { src: '/fonts/IBMPlexSans-Regular.ttf' },
    { src: '/fonts/IBMPlexSans-SemiBold.ttf', fontWeight: 700 },
  ],
});

// Engine-agnostic Shift Summary report as a @react-pdf/renderer component.
// Flexbox layout (Yoga) + PDFKit, no browser needed; the SAME component renders
// client-side and server-side later. Sections are config-driven for the
// upcoming "configurable shift summary" picker.

export type ShiftSummarySection =
  | 'header' | 'meta' | 'kpis' | 'nozzles' | 'handovers' | 'collections' | 'expenses' | 'variance' | 'signatures';

export interface ReportConfig {
  sections: ShiftSummarySection[];
  showLogo: boolean;
  stationName?: string;
  paper: 'A4' | 'LETTER';
}

export const DEFAULT_SHIFT_SUMMARY_CONFIG: ReportConfig = {
  sections: ['header', 'meta', 'kpis', 'nozzles', 'handovers', 'variance', 'signatures'],
  showLogo: true,
  paper: 'A4',
};

const C = { green: '#1F6A53', ink: '#18201A', body: '#2B342D', muted: '#5E6A61', line: '#D9DED6', surfaceAlt: '#F1F3EF', danger: '#9F3F36', amber: '#8A6116', white: '#FFFFFF' };
const inr = (n: any) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const vol = (n: any) => `${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} L`;
const fmtTime = (iso?: string) => { if (!iso) return '—'; try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } };

const s = StyleSheet.create({
  page: { paddingTop: 32, paddingHorizontal: 36, paddingBottom: 48, fontSize: 10, color: C.body, fontFamily: 'IBM Plex Sans' },
  band: { backgroundColor: C.green, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 6 },
  brand: { fontSize: 15, color: C.white, fontWeight: 700 },
  title: { fontSize: 11, color: C.white, marginTop: 3, letterSpacing: 1.5, fontWeight: 700 },
  sub: { fontSize: 9, color: C.muted, marginTop: 6 },
  metaRow: { flexDirection: 'row', marginTop: 12, gap: 12 },
  metaCell: { flex: 1 },
  label: { fontSize: 7.5, color: C.muted },
  val: { fontSize: 11, color: C.ink, fontWeight: 700, marginTop: 2 },
  kpiRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  kpi: { flex: 1, backgroundColor: C.surfaceAlt, borderRadius: 6, padding: 8 },
  kpiLabel: { fontSize: 7.5, color: C.muted },
  kpiVal: { fontSize: 13, fontWeight: 700, marginTop: 3 },
  h2: { fontSize: 10, color: C.green, fontWeight: 700, marginTop: 16, marginBottom: 6, letterSpacing: 0.6 },
  tr: { flexDirection: 'row' },
  thRow: { backgroundColor: C.green, borderRadius: 4 },
  th: { color: C.white, fontSize: 8.5, fontWeight: 700, paddingVertical: 5, paddingHorizontal: 8 },
  td: { fontSize: 9.5, paddingVertical: 4, paddingHorizontal: 8, color: C.body },
  tdStrong: { fontSize: 9.5, paddingVertical: 4, paddingHorizontal: 8, color: C.ink, fontWeight: 700 },
  zebra: { backgroundColor: C.surfaceAlt },
  totalRow: { borderTopWidth: 0.5, borderTopColor: C.line },
  signRow: { flexDirection: 'row', gap: 40, marginTop: 40 },
  sign: { flex: 1, fontSize: 9, color: C.muted, textAlign: 'center', borderTopWidth: 0.5, borderTopColor: C.muted, paddingTop: 4 },
  foot: { position: 'absolute', bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: C.muted },
});

const Kpi = ({ l, v, c = C.ink }: { l: string; v: string; c?: string }) => (
  <View style={s.kpi}><Text style={s.kpiLabel}>{l.toUpperCase()}</Text><Text style={[s.kpiVal, { color: c }]}>{v}</Text></View>
);

const renderers: Record<ShiftSummarySection, (d: any, cfg: ReportConfig) => React.ReactNode> = {
  header: (_d, cfg) => (
    <View key="h"><View style={s.band}><Text style={s.brand}>{cfg.stationName || 'PumpOS'}</Text><Text style={s.title}>SHIFT SUMMARY RECORD</Text></View><Text style={s.sub}>Authoritative operational snapshot</Text></View>
  ),
  meta: (d) => (
    <View key="m" style={s.metaRow}>
      <View style={s.metaCell}><Text style={s.label}>SHIFT</Text><Text style={s.val}>{d.templateName || '—'}</Text></View>
      <View style={s.metaCell}><Text style={s.label}>DURATION</Text><Text style={s.val}>{fmtTime(d.openedAt)} - {fmtTime(d.closedAt)}</Text></View>
      <View style={s.metaCell}><Text style={s.label}>RECONCILED BY</Text><Text style={s.val}>{d.closedByName || d.closedBy || '—'}</Text></View>
    </View>
  ),
  kpis: (d) => (
    <View key="k" style={s.kpiRow}><Kpi l="Total Volume" v={vol(d.totalVolumeSold)} c={C.green} /><Kpi l="Expected Cash" v={inr(d.expectedCash)} /><Kpi l="Variance" v={inr(d.cashVariance)} c={Number(d.cashVariance) < 0 ? C.danger : C.green} /></View>
  ),
  nozzles: (d) => (
    <View key="n"><Text style={s.h2}>NOZZLE RECONCILIATION & VOLUME SOLD</Text>
      <View style={[s.tr, s.thRow]}><Text style={[s.th, { width: 50 }]}>Nozzle</Text><Text style={[s.th, { flex: 1 }]}>Product</Text><Text style={[s.th, { width: 70, textAlign: 'right' }]}>Opening</Text><Text style={[s.th, { width: 70, textAlign: 'right' }]}>Closing</Text><Text style={[s.th, { width: 80, textAlign: 'right' }]}>Volume</Text></View>
      {(d.nozzleReadings || []).map((r: any, i: number) => (
        <View key={i} style={[s.tr, i % 2 ? s.zebra : {}]}><Text style={[s.tdStrong, { width: 50 }]}>{r.nozzleName || r.nozzleNumber || ''}</Text><Text style={[s.td, { flex: 1 }]}>{r.productName || ''}</Text><Text style={[s.td, { width: 70, textAlign: 'right' }]}>{Number(r.openingReading ?? 0).toFixed(3)}</Text><Text style={[s.td, { width: 70, textAlign: 'right' }]}>{Number(r.closingReading ?? 0).toFixed(3)}</Text><Text style={[s.tdStrong, { width: 80, textAlign: 'right' }]}>{vol(r.volume ?? r.volumeSold)}</Text></View>
      ))}
      <View style={[s.tr, s.totalRow]}><Text style={[s.tdStrong, { flex: 1 }]}>TOTAL FUEL SOLD</Text><Text style={[s.tdStrong, { width: 80, textAlign: 'right', color: C.green }]}>{vol(d.totalVolumeSold)}</Text></View>
    </View>
  ),
  handovers: (d) => (
    <View key="ha"><Text style={s.h2}>ATTENDANT HANDOVERS</Text>
      <View style={[s.tr, s.thRow]}><Text style={[s.th, { flex: 1 }]}>Attendant</Text><Text style={[s.th, { width: 90, textAlign: 'right' }]}>Cash</Text><Text style={[s.th, { width: 90, textAlign: 'right' }]}>Card/UPI</Text><Text style={[s.th, { width: 90, textAlign: 'right' }]}>Credit</Text></View>
      {(d.handovers || []).map((h: any, i: number) => (
        <View key={i} style={[s.tr, i % 2 ? s.zebra : {}]}><Text style={[s.tdStrong, { flex: 1 }]}>{h.attendantName || ''}</Text><Text style={[s.td, { width: 90, textAlign: 'right' }]}>{inr(h.cashHandedOver)}</Text><Text style={[s.td, { width: 90, textAlign: 'right' }]}>{inr((h.cardHandedOver || 0) + (h.upiHandedOver || 0))}</Text><Text style={[s.td, { width: 90, textAlign: 'right' }]}>{inr(h.creditHandedOver)}</Text></View>
      ))}
    </View>
  ),
  collections: (d) => (<View key="c"><Text style={s.h2}>NON-CASH PAYMENTS</Text><View style={s.kpiRow}><Kpi l="Card" v={inr(d.cardCollectionsSum)} /><Kpi l="UPI" v={inr(d.upiCollectionsSum)} /><Kpi l="Credit" v={inr(d.creditSalesSum)} /></View></View>),
  expenses: (d) => (<View key="e"><Text style={s.h2}>PETTY EXPENSES</Text><View style={s.kpiRow}><Kpi l="Cash Expenses" v={inr(d.cashExpensesSum)} c={C.amber} /></View></View>),
  variance: (d) => (<View key="v" style={s.kpiRow}><Kpi l="Opening Cash" v={inr(d.openingCash)} /><Kpi l="Closing Cash" v={inr(d.closingCash)} /><Kpi l="Variance" v={inr(d.cashVariance)} c={Number(d.cashVariance) < 0 ? C.danger : C.green} /></View>),
  signatures: () => (<View key="sg" style={s.signRow}><Text style={s.sign}>Operator</Text><Text style={s.sign}>Manager</Text></View>),
};

export const ShiftSummaryDoc: React.FC<{ snapshot: any; config?: ReportConfig }> = ({ snapshot, config = DEFAULT_SHIFT_SUMMARY_CONFIG }) => (
  <Document>
    <Page size={config.paper} style={s.page}>
      {config.sections.map((key) => renderers[key]?.(snapshot, config))}
      <View style={s.foot} fixed>
        <Text>Generated {new Date().toLocaleString('en-IN')}</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  </Document>
);

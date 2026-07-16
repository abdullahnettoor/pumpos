import React from 'react';
import { Document, Page, View, Text, StyleSheet, Font, Image } from '@react-pdf/renderer';

// Embed IBM Plex Sans + Mono (matches the app type, include the rupee glyph; Mono
// is used for all numeric/currency cells). TTFs vendored locally (npm run fonts).
Font.register({
  family: 'IBM Plex Sans',
  fonts: [
    { src: '/fonts/IBMPlexSans-Regular.ttf' },
    { src: '/fonts/IBMPlexSans-SemiBold.ttf', fontWeight: 700 },
  ],
});
Font.register({
  family: 'IBM Plex Mono',
  fonts: [
    { src: '/fonts/IBMPlexMono-Regular.ttf' },
    { src: '/fonts/IBMPlexMono-Medium.ttf', fontWeight: 700 },
  ],
});

export type { ShiftSummarySection, ReportConfig } from './reportConfig.js';
export { DEFAULT_SHIFT_SUMMARY_CONFIG, SHIFT_SUMMARY_SECTION_LABELS } from './reportConfig.js';
export type { Letterhead } from './letterhead.js';
export { letterheadFromStation } from './letterhead.js';
import type { ShiftSummarySection, ReportConfig } from './reportConfig.js';
import { DEFAULT_SHIFT_SUMMARY_CONFIG } from './reportConfig.js';
import type { Letterhead } from './letterhead.js';

export const C = {
  green: '#1F6A53', ink: '#18201A', body: '#2B342D', muted: '#5E6A61', faint: '#7A857C',
  line: '#D9DED6', surfaceAlt: '#F1F3EF', danger: '#9F3F36', amber: '#8A6116', success: '#1E6A4E',
  warnBg: '#F9F0DA', warnFg: '#8A6116', white: '#FFFFFF',
};

export const inr = (n: any) => `\u20b9${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const inr0 = (n: any) => `\u20b9${Number(n || 0).toLocaleString('en-IN')}`;
export const vol3 = (n: any) => `${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} L`;
export const vol1 = (n: any) => `${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;
// Unit-aware variants (L for liquids, kg for CNG/Auto-LPG). Never sum across units.
export const vol3u = (n: any, u?: string) => `${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${u || 'L'}`;
export const vol1u = (n: any, u?: string) => `${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${u || 'L'}`;
export const unitTotals = (rows: any[], getter: (r: any) => number, dec = 3): string => {
  const m: Record<string, number> = {};
  for (const r of rows) { const u = r.unit || 'L'; m[u] = (m[u] || 0) + Number(getter(r) || 0); }
  return Object.entries(m).map(([u, v]) => `${Number(v).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${u}`).join(' \u00b7 ');
};
export const fix3 = (n: any) => Number(n || 0).toFixed(3);
export const fmtTime = (iso?: string) => { if (!iso) return '—'; try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } };
export const fmtDateTime = (iso?: string) => { if (!iso) return '—'; try { return new Date(iso).toLocaleString('en-IN'); } catch { return '—'; } };

export const s = StyleSheet.create({
  page: { paddingTop: 30, paddingHorizontal: 32, paddingBottom: 46, fontSize: 9, color: C.body, fontFamily: 'IBM Plex Sans' },
  band: { backgroundColor: C.green, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 6 },
  brand: { fontSize: 15, color: C.white, fontWeight: 700 },
  title: { fontSize: 11, color: C.white, marginTop: 3, letterSpacing: 1.5, fontWeight: 700 },
  sub: { fontSize: 8.5, color: C.muted, marginTop: 6 },
  metaBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, backgroundColor: C.surfaceAlt, borderRadius: 6, padding: 12, marginTop: 12 },
  metaCell: { width: '22%', minWidth: 110 },
  label: { fontSize: 7, color: C.muted },
  val: { fontSize: 10, color: C.ink, fontWeight: 700, marginTop: 2 },
  valMono: { fontSize: 10, color: C.ink, fontFamily: 'IBM Plex Mono', marginTop: 2 },
  h2: { fontSize: 9.5, color: C.green, fontWeight: 700, marginTop: 16, marginBottom: 6, letterSpacing: 0.5 },
  warn: { backgroundColor: C.warnBg, borderRadius: 6, padding: 10, marginTop: 12 },
  warnTitle: { fontSize: 8.5, color: C.warnFg, fontWeight: 700, marginBottom: 4 },
  warnItem: { fontSize: 8.5, color: C.warnFg, marginTop: 2 },
  tr: { flexDirection: 'row', alignItems: 'flex-start' },
  thRow: { backgroundColor: C.green, borderRadius: 3 },
  th: { color: C.white, fontSize: 7.5, fontWeight: 700, paddingVertical: 5, paddingHorizontal: 6 },
  cell: { fontSize: 8.5, paddingVertical: 4, paddingHorizontal: 6, color: C.body },
  cellStrong: { fontSize: 8.5, paddingVertical: 4, paddingHorizontal: 6, color: C.ink, fontWeight: 700 },
  cellMono: { fontSize: 8.5, paddingVertical: 4, paddingHorizontal: 6, color: C.body, fontFamily: 'IBM Plex Mono' },
  cellMonoStrong: { fontSize: 8.5, paddingVertical: 4, paddingHorizontal: 6, color: C.ink, fontFamily: 'IBM Plex Mono', fontWeight: 700 },
  zebra: { backgroundColor: C.surfaceAlt },
  totalRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.surfaceAlt },
  totalLabel: { flex: 1, fontSize: 8, paddingVertical: 5, paddingHorizontal: 6, color: C.muted, fontWeight: 700 },
  reconRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 6, paddingHorizontal: 10 },
  reconBox: { borderWidth: 0.5, borderColor: C.line, borderRadius: 6, marginTop: 4, marginBottom: 8 },
  kpiRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  kpi: { flex: 1, backgroundColor: C.surfaceAlt, borderRadius: 6, padding: 8 },
  kpiLabel: { fontSize: 7, color: C.muted },
  kpiVal: { fontSize: 12, fontFamily: 'IBM Plex Mono', marginTop: 3 },
  signRow: { flexDirection: 'row', gap: 40, marginTop: 36 },
  sign: { flex: 1, fontSize: 8.5, color: C.muted, textAlign: 'center', borderTopWidth: 0.5, borderTopColor: C.muted, paddingTop: 4 },
  foot: { position: 'absolute', bottom: 22, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: C.muted },
});

// --- Generic table -----------------------------------------------------------
export type Col = { header: string; flex: number; align?: 'right'; mono?: boolean; strong?: boolean };
export type Cell = { text: string; color?: string };
export const TableView = ({ columns, rows, total, totals }: { columns: Col[]; rows: Cell[][]; total?: Cell[]; totals?: Cell[][] }) => (
  <View>
    <View style={[s.tr, s.thRow]}>
      {columns.map((c, i) => (
        <Text key={i} style={[s.th, { flex: c.flex }, c.align === 'right' ? { textAlign: 'right' } : {}]}>{c.header}</Text>
      ))}
    </View>
    {rows.map((cells, ri) => (
      <View key={ri} style={[s.tr, ri % 2 === 1 ? s.zebra : {}]}>
        {cells.map((cell, ci) => {
          const c = columns[ci];
          const base = c.mono ? (c.strong ? s.cellMonoStrong : s.cellMono) : (c.strong ? s.cellStrong : s.cell);
          return (
            <Text key={ci} style={[base, { flex: c.flex }, c.align === 'right' ? { textAlign: 'right' } : {}, cell.color ? { color: cell.color } : {}]}>{cell.text}</Text>
          );
        })}
      </View>
    ))}
    {[...(total ? [total] : []), ...(totals ?? [])].map((tRow, ti) => (
      <View key={`t${ti}`} style={s.totalRow}>
        {tRow.map((cell, ci) => {
          const c = columns[ci];
          return (
            <Text key={ci} style={[c.mono ? s.cellMonoStrong : s.cellStrong, { flex: c.flex }, c.align === 'right' ? { textAlign: 'right' } : {}, { color: cell.color ?? C.ink }]}>{cell.text}</Text>
          );
        })}
      </View>
    ))}
  </View>
);

export const Kpi = ({ l, v, c = C.ink }: { l: string; v: string; c?: string }) => (
  <View style={s.kpi}><Text style={s.kpiLabel}>{l.toUpperCase()}</Text><Text style={[s.kpiVal, { color: c }]}>{v}</Text></View>
);

export const varColor = (v: number) => (v < 0 ? C.danger : v > 0 ? C.amber : C.success);

/**
 * Branded report header: green band with legal/station name + a doc title, an
 * optional uploaded logo, and a legal sub-line (GSTIN · RO code · brand · address).
 * Shared by the shift summary and DSSR documents.
 */
export const LetterheadBand = ({ title, stationName, letterhead }: { title: string; stationName?: string; letterhead?: Letterhead }) => {
  const lh = letterhead || {};
  const heading = lh.legalName || stationName || 'PumpOS';
  const legalBits = [
    lh.gstin ? `GSTIN: ${lh.gstin}` : '',
    lh.roCode ? `RO: ${lh.roCode}` : '',
    lh.fuelBrand || '',
    [lh.addressLine, lh.pincode].filter(Boolean).join(', '),
    lh.contact || '',
  ].filter(Boolean).join('  •  ');
  return (
    <View>
      <View style={s.band}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={s.brand}>{heading}</Text>
            <Text style={s.title}>{title}</Text>
          </View>
          {lh.logoDataUrl ? <Image src={lh.logoDataUrl} style={{ width: 48, height: 48, objectFit: 'contain' }} /> : null}
        </View>
      </View>
      {legalBits ? <Text style={[s.sub, { marginTop: 4 }]}>{legalBits}</Text> : null}
    </View>
  );
};

const builders: Record<ShiftSummarySection, (d: any, cfg: ReportConfig) => React.ReactNode> = {
  header: (d, cfg) => (
    <View key="header">
      <LetterheadBand title="SHIFT SUMMARY RECORD" stationName={cfg.stationName} letterhead={cfg.letterhead} />
      <Text style={s.sub}>Authoritative Operational Snapshot{d.generatedAt ? ` \u2022 Compiled ${fmtDateTime(d.generatedAt)}` : ''}</Text>
    </View>
  ),
  meta: (d) => (
    <View key="meta" style={s.metaBox}>
      <View style={s.metaCell}><Text style={s.label}>SHIFT ID</Text><Text style={s.valMono}>{String(d.shiftId || '').slice(0, 8)}...</Text></View>
      <View style={s.metaCell}><Text style={s.label}>SHIFT TEMPLATE</Text><Text style={s.val}>{d.templateName || 'Custom'}</Text></View>
      <View style={s.metaCell}><Text style={s.label}>OPERATIONAL DURATION</Text><Text style={s.val}>{fmtTime(d.openedAt)} - {fmtTime(d.closedAt)}</Text></View>
      <View style={s.metaCell}><Text style={s.label}>RECONCILED BY</Text><Text style={s.val}>{d.closedByName || d.closedBy || '—'}</Text></View>
    </View>
  ),
  warnings: (d) => (d.warnings && d.warnings.length > 0 ? (
    <View key="warnings" style={s.warn}>
      <Text style={s.warnTitle}>Warnings Captured at Close Time:</Text>
      {d.warnings.map((w: string, i: number) => <Text key={i} style={s.warnItem}>• {w}</Text>)}
    </View>
  ) : null),
  nozzles: (d) => {
    const nrs = d.nozzleReadings || [];
    const rows: Cell[][] = nrs.map((nr: any) => {
      const gross = Number(nr.volumeSold ?? 0);
      const testing = Number(nr.testingVolume ?? 0);
      const net = nr.netVolume != null ? Number(nr.netVolume) : gross - testing;
      return [
        { text: nr.nozzleName || '' },
        { text: `${nr.productName || ''}${nr.productCode ? ` (${nr.productCode})` : ''}` },
        { text: fix3(nr.openingReading) },
        { text: fix3(nr.closingReading ?? nr.openingReading) },
        { text: vol3u(gross, nr.unit) },
        { text: vol3u(testing, nr.unit), color: testing > 0 ? C.amber : C.muted },
        { text: vol3u(net, nr.unit) },
      ];
    });
    const nUnits: string[] = Array.from(new Set(nrs.map((r: any) => r.unit || 'L')));
    const fbp = d.fuelByProduct || [];
    return (
      <View key="nozzles"><Text style={s.h2}>NOZZLE RECONCILIATION &amp; VOLUME SOLD</Text>
        <TableView
          columns={[
            { header: 'Nozzle', flex: 1.2, strong: true }, { header: 'Product', flex: 2.2 },
            { header: 'Opening Rd', flex: 1.3, align: 'right', mono: true }, { header: 'Closing Rd', flex: 1.3, align: 'right', mono: true },
            { header: 'Gross', flex: 1.2, align: 'right', mono: true }, { header: 'Testing', flex: 1.1, align: 'right', mono: true },
            { header: 'Net Sold', flex: 1.3, align: 'right', mono: true, strong: true },
          ]}
          rows={rows}
          totals={nUnits.map((u) => {
            const ru = nrs.filter((r: any) => (r.unit || 'L') === u);
            const g = ru.reduce((a: number, r: any) => a + Number(r.volumeSold || 0), 0);
            const t = ru.reduce((a: number, r: any) => a + Number(r.testingVolume || 0), 0);
            const n = ru.reduce((a: number, r: any) => a + (r.netVolume != null ? Number(r.netVolume) : Number(r.volumeSold || 0) - Number(r.testingVolume || 0)), 0);
            return [{ text: `TOTAL \u2014 ${u}` }, { text: '' }, { text: '' }, { text: '' }, { text: vol3u(g, u), color: C.muted }, { text: vol3u(t, u), color: C.muted }, { text: vol3u(n, u), color: C.green }];
          })}
        />
        {fbp.length > 0 ? (
          <View style={{ marginTop: 10 }}>
            <Text style={s.h2}>PRODUCT-WISE FUEL SALES</Text>
            <TableView
              columns={[
                { header: 'Product', flex: 2.4, strong: true },
                { header: 'Gross Vol', flex: 1.4, align: 'right', mono: true },
                { header: 'Testing', flex: 1.3, align: 'right', mono: true },
                { header: 'Net Sold', flex: 1.4, align: 'right', mono: true, strong: true },
                { header: 'Sales Value (\u20b9)', flex: 1.6, align: 'right', mono: true, strong: true },
              ]}
              rows={fbp.map((p: any) => [
                { text: `${p.productName || ''}${p.productCode ? ` (${p.productCode})` : ''}` },
                { text: vol3u(p.grossVolume, p.unit) },
                { text: vol3u(p.testingVolume, p.unit), color: Number(p.testingVolume || 0) > 0 ? C.amber : C.muted },
                { text: vol3u(p.netVolume, p.unit) },
                { text: inr(p.salesValue) },
              ])}
              totals={Array.from(new Set<string>(fbp.map((p: any) => String(p.unit || 'L')))).map((u) => {
                const pu = fbp.filter((p: any) => (p.unit || 'L') === u);
                const g = pu.reduce((a: number, p: any) => a + Number(p.grossVolume || 0), 0);
                const t = pu.reduce((a: number, p: any) => a + Number(p.testingVolume || 0), 0);
                const n = pu.reduce((a: number, p: any) => a + Number(p.netVolume || 0), 0);
                const sv = pu.reduce((a: number, p: any) => a + Number(p.salesValue || 0), 0);
                return [{ text: `TOTAL \u2014 ${u}` }, { text: vol3u(g, u), color: C.muted }, { text: vol3u(t, u), color: C.muted }, { text: vol3u(n, u), color: C.green }, { text: inr(sv) }];
              })}
            />
          </View>
        ) : null}
      </View>
    );
  },
  handovers: (d) => (d.handovers && d.handovers.length > 0 ? (
    <View key="handovers"><Text style={s.h2}>ATTENDANT HANDOVERS SUMMARY</Text>
      <TableView
        columns={[
          { header: 'Attendant', flex: 1.6, strong: true }, { header: 'Dispenser', flex: 1.1 },
          { header: 'Cash (\u20b9)', flex: 1.3, align: 'right', mono: true }, { header: 'Card/UPI (\u20b9)', flex: 1.4, align: 'right', mono: true },
          { header: 'Credit Chits (\u20b9)', flex: 1.5, align: 'right', mono: true }, { header: 'Expected (\u20b9)', flex: 1.4, align: 'right', mono: true, strong: true },
          { header: 'Variance (\u20b9)', flex: 1.4, align: 'right', mono: true },
        ]}
        rows={(d.handovers || []).map((h: any) => {
          const v = Number(h.varianceAmount || 0);
          return [
            { text: h.attendantName || '' }, { text: h.duCode || '' },
            { text: inr(h.cashHandedOver) }, { text: inr(Number(h.cardHandedOver || 0) + Number(h.upiHandedOver || 0)) },
            { text: inr(h.creditHandedOver) }, { text: inr(h.expectedSales) },
            { text: `${v > 0 ? '+' : ''}${inr(v)}`, color: varColor(v) },
          ];
        })}
        total={(() => {
          const tv = (d.handovers || []).reduce((a: number, h: any) => a + Number(h.varianceAmount || 0), 0);
          return [
            { text: 'TOTALS' }, { text: '' },
            { text: inr((d.handovers || []).reduce((a: number, h: any) => a + Number(h.cashHandedOver || 0), 0)) },
            { text: inr((d.handovers || []).reduce((a: number, h: any) => a + Number(h.cardHandedOver || 0) + Number(h.upiHandedOver || 0), 0)) },
            { text: inr((d.handovers || []).reduce((a: number, h: any) => a + Number(h.creditHandedOver || 0), 0)) },
            { text: inr((d.handovers || []).reduce((a: number, h: any) => a + Number(h.expectedSales || 0), 0)) },
            { text: `${tv > 0 ? '+' : ''}${inr(tv)}`, color: varColor(tv) },
          ];
        })()}
      />
    </View>
  ) : null),
  terminals: (d) => {
    const tb = d.terminalBreakdown || [];
    if (tb.length === 0) return null;
    const rows: Cell[][] = tb.map((t: any) => {
      const handledBy = (t.entries || [])
        .filter((e: any) => Number(e.card || 0) > 0 || Number(e.upi || 0) > 0)
        .map((e: any) => `${e.attendantName}${e.duCode ? ` · ${e.duCode}` : ''}`)
        .join('\n') || '—';
      return [
        { text: `${t.terminalLabel || 'Unknown'}${t.provider ? `\n${t.provider}` : ''}` },
        { text: handledBy },
        { text: inr(t.card) }, { text: inr(t.upi) }, { text: inr(Number(t.card || 0) + Number(t.upi || 0)) },
      ];
    });
    const totCard = tb.reduce((a: number, t: any) => a + Number(t.card || 0), 0);
    const totUpi = tb.reduce((a: number, t: any) => a + Number(t.upi || 0), 0);
    return (
      <View key="terminals"><Text style={s.h2}>POS TERMINAL SETTLEMENT SUMMARY</Text>
        <TableView
          columns={[
            { header: 'Terminal', flex: 1.6, strong: true }, { header: 'Handled By', flex: 2.6 },
            { header: 'Card (\u20b9)', flex: 1.3, align: 'right', mono: true }, { header: 'UPI (\u20b9)', flex: 1.3, align: 'right', mono: true },
            { header: 'Total (\u20b9)', flex: 1.4, align: 'right', mono: true, strong: true },
          ]}
          rows={rows}
          total={[{ text: 'POS TOTALS' }, { text: '' }, { text: inr(totCard) }, { text: inr(totUpi) }, { text: inr(totCard + totUpi), color: C.green }]}
        />
      </View>
    );
  },
  creditSales: (d) => (d.creditSales && d.creditSales.length > 0 ? (
    <View key="creditSales"><Text style={s.h2}>FUEL-ON-CREDIT SALES</Text>
      <TableView
        columns={[
          { header: 'Customer', flex: 1.8, strong: true }, { header: 'Vehicle', flex: 1.3, mono: true },
          { header: 'Product', flex: 1.4 }, { header: 'Qty', flex: 1.1, align: 'right', mono: true },
          { header: 'Notes', flex: 1.8 }, { header: 'Amount (\u20b9)', flex: 1.3, align: 'right', mono: true, strong: true },
        ]}
        rows={(d.creditSales || []).map((r: any) => [
          { text: r.customerName || 'Customer' }, { text: r.vehicleNumber || '\u2014' },
          { text: r.productName || '\u2014' }, { text: r.quantity != null ? vol3u(r.quantity, r.unit) : '\u2014' },
          { text: r.notes || '—' }, { text: inr(r.amount) },
        ])}
        total={[{ text: 'TOTAL CREDIT SALES' }, { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: inr(d.creditSalesTotal ?? (d.creditSales || []).reduce((a: number, r: any) => a + Number(r.amount || 0), 0)), color: C.green }]}
      />
    </View>
  ) : null),
  dips: (d) => (d.dipReadings && d.dipReadings.length > 0 ? (
    <View key="dips"><Text style={s.h2}>TANK PHYSICAL DIP RECONCILIATION</Text>
      <TableView
        columns={[
          { header: 'Tank', flex: 1.6, strong: true }, { header: 'Product', flex: 2 },
          { header: 'Tank Capacity', flex: 1.5, align: 'right', mono: true }, { header: 'Physical Actual Stock', flex: 1.8, align: 'right', mono: true, strong: true },
        ]}
        rows={(d.dipReadings || []).map((r: any) => [
          { text: r.tankName || '' }, { text: `${r.productName || ''}${r.productCode ? ` (${r.productCode})` : ''}` },
          { text: `${Number(r.capacity || 0).toLocaleString('en-IN')} ${r.unit || 'L'}` }, { text: vol1u(r.actualQuantity, r.unit) },
        ])}
      />
    </View>
  ) : null),
  stockVariances: (d) => (d.stockVariances && d.stockVariances.length > 0 ? (
    <View key="stockVariances"><Text style={s.h2}>PRODUCT STOCK VARIANCES</Text>
      <TableView
        columns={[
          { header: 'Product', flex: 2, strong: true }, { header: 'Expected Stock', flex: 1.4, align: 'right', mono: true },
          { header: 'Physical Actual', flex: 1.4, align: 'right', mono: true }, { header: 'Variance', flex: 1.3, align: 'right', mono: true },
          { header: 'Status', flex: 1.4 },
        ]}
        rows={(d.stockVariances || []).map((sv: any) => {
          const diff = Number(sv.varianceQuantity || 0);
          const severe = Number(sv.expectedQuantity || 0) > 0 && Math.abs(diff) > 0.005 * Number(sv.expectedQuantity);
          return [
            { text: `${sv.productName || ''}${sv.productCode ? ` (${sv.productCode})` : ''}` },
            { text: vol1u(sv.expectedQuantity, sv.unit) }, { text: vol1u(sv.actualQuantity, sv.unit) },
            { text: `${diff > 0 ? '+' : ''}${vol1u(diff, sv.unit)}`, color: diff < 0 ? C.danger : diff > 0 ? C.success : C.ink },
            { text: severe ? 'Discrepancy (>0.5%)' : 'Normal', color: severe ? C.warnFg : C.success },
          ];
        })}
      />
    </View>
  ) : null),
  cashRecon: (d) => (
    <View key="cashRecon"><Text style={s.h2}>CASH RECONCILIATION &amp; VARIANCES</Text>
      <View style={s.reconBox}>
        {[
          { l: 'Opening Cash Float', v: inr0(d.openingCash), c: C.ink },
          { l: '(+) Cash Sales (Attendant Handovers)', v: `+ ${inr0(d.cashSalesSum)}`, c: C.success },
          { l: '(+) Cash Collections', v: `+ ${inr0(d.cashCollectionsSum)}`, c: C.success },
          { l: '(-) Petty Cash Expenses', v: `- ${inr0(d.cashExpensesSum)}`, c: C.danger },
          { l: 'Expected Cash in Drawer', v: inr0(d.expectedCash), c: C.ink },
          { l: 'Actual Closing Cash (Entered)', v: inr0(d.closingCash), c: C.ink },
        ].map((r, i) => (
          <View key={i} style={s.reconRow}>
            <Text style={{ fontSize: 9, color: r.c }}>{r.l}</Text>
            <Text style={{ fontSize: 9, color: r.c, fontFamily: 'IBM Plex Mono', fontWeight: 700 }}>{r.v}</Text>
          </View>
        ))}
        <View style={[s.reconRow, { borderBottomWidth: 0, backgroundColor: Math.abs(Number(d.cashVariance || 0)) > 100 ? '#F8E3E0' : C.surfaceAlt }]}>
          <Text style={{ fontSize: 10, fontWeight: 700, color: Math.abs(Number(d.cashVariance || 0)) > 100 ? C.danger : C.ink }}>Cash Variance</Text>
          <Text style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', fontWeight: 700, color: Math.abs(Number(d.cashVariance || 0)) > 100 ? C.danger : C.ink }}>
            {Number(d.cashVariance || 0) > 0 ? '+' : ''}{inr0(d.cashVariance)}{Number(d.cashVariance || 0) === 0 ? ' (Perfect Match)' : Math.abs(Number(d.cashVariance || 0)) > 100 ? ' (Discrepancy)' : ''}
          </Text>
        </View>
      </View>
    </View>
  ),
  nonCash: (d) => (
    <View key="nonCash"><Text style={s.h2}>NON-CASH COLLECTIONS</Text>
      <View style={s.kpiRow}>
        <Kpi l="Card Collections" v={inr0(d.cardCollectionsSum)} />
        <Kpi l="UPI/QR Collections" v={inr0(d.upiCollectionsSum)} />
        <Kpi l="Bank Transfer Collections" v={inr0(d.bankCollectionsSum)} />
      </View>
    </View>
  ),
  expenses: (d) => (d.expenses && d.expenses.length > 0 ? (
    <View key="expenses"><Text style={s.h2}>SHIFT PETTY CASH EXPENSES</Text>
      <TableView
        columns={[
          { header: 'Category', flex: 1.6, strong: true }, { header: 'Description', flex: 2.6 },
          { header: 'Amount', flex: 1.2, align: 'right', mono: true },
        ]}
        rows={(d.expenses || []).map((e: any) => [
          { text: e.categoryName || 'General' }, { text: e.description || '—' }, { text: `- ${inr0(e.amount)}`, color: C.danger },
        ])}
      />
    </View>
  ) : null),
  purchases: (d) => (d.purchases && d.purchases.length > 0 ? (
    <View key="purchases"><Text style={s.h2}>SUPPLIER FUEL INTAKES</Text>
      <TableView
        columns={[
          { header: 'Supplier', flex: 1.8, strong: true }, { header: 'Ref / Invoice', flex: 1.8, mono: true },
          { header: 'Notes', flex: 2 }, { header: 'Amount', flex: 1.2, align: 'right', mono: true },
        ]}
        rows={(d.purchases || []).map((p: any) => [
          { text: p.supplierName || 'Unknown Supplier' },
          { text: `${p.documentNumber || ''}${p.invoiceNumber ? ` (${p.invoiceNumber})` : ''}` },
          { text: p.notes || '—' }, { text: inr0(p.amount) },
        ])}
      />
    </View>
  ) : null),
  collections: (d) => (d.collections && d.collections.length > 0 ? (
    <View key="collections"><Text style={s.h2}>COLLECTIONS &amp; ACCOUNT SALES LOGS</Text>
      <TableView
        columns={[
          { header: 'Customer', flex: 1.8, strong: true }, { header: 'Method', flex: 1.1 },
          { header: 'Notes', flex: 2.2 }, { header: 'Amount', flex: 1.2, align: 'right', mono: true },
        ]}
        rows={(d.collections || []).map((c: any) => [
          { text: c.customerName || 'Walk-in Customer' }, { text: c.paymentMethod || '' },
          { text: c.notes || '—' }, { text: inr0(c.amount), color: c.paymentMethod === 'Credit' ? C.muted : C.success },
        ])}
      />
    </View>
  ) : null),
  signatures: () => (
    <View key="signatures" style={s.signRow}>
      <Text style={s.sign}>Operator / Reconciliation Staff Signature</Text>
      <Text style={s.sign}>Owner / Manager Verification Signature</Text>
    </View>
  ),
};

export const ShiftSummaryDoc: React.FC<{ snapshot: any; config?: ReportConfig }> = ({ snapshot, config = DEFAULT_SHIFT_SUMMARY_CONFIG }) => (
  <Document>
    <Page size={config.paper} style={s.page}>
      {config.sections.map((key) => builders[key]?.(snapshot, config))}
      <View style={s.foot} fixed>
        <Text>Generated {new Date().toLocaleString('en-IN')}</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </Page>
  </Document>
);

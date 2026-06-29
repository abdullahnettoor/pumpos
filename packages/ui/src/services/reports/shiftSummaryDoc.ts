// Engine-agnostic Shift Summary report definitions. Pure functions: take the
// immutable snapshot + a station ReportConfig, return a pdfmake docDefinition.
// No DOM / Hono / DB imports, so the SAME builder runs client-side (preview /
// quick download) and server-side (Worker canonical PDF) later.

export type ShiftSummarySection =
  | 'header'
  | 'meta'
  | 'kpis'
  | 'nozzles'
  | 'handovers'
  | 'collections'
  | 'expenses'
  | 'variance'
  | 'signatures';

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

// Design-system palette (mirrors packages/ui/src/index.css).
const C = {
  green: '#1F6A53',
  ink: '#18201A',
  body: '#2B342D',
  muted: '#5E6A61',
  line: '#D9DED6',
  surfaceAlt: '#F1F3EF',
  danger: '#9F3F36',
  amber: '#8A6116',
};

const inr = (n: any) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const vol = (n: any) => `${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} L`;

type Block = Record<string, unknown>;

const sectionHeading = (t: string): Block => ({ text: t.toUpperCase(), style: 'h2', margin: [0, 14, 0, 6] });
const kpiBox = (label: string, value: string, color = C.ink): Block => ({
  table: { widths: ['*'], body: [[{ text: label.toUpperCase(), style: 'kpiLabel' }], [{ text: value, color, style: 'kpiValue' }]] },
  layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => C.surfaceAlt, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 },
});

const zebra = (_cols: number) => ({
  fillColor: (rowIndex: number) => (rowIndex === 0 ? C.green : rowIndex % 2 === 0 ? C.surfaceAlt : null),
  hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0.5 : 0),
  vLineWidth: () => 0,
  hLineColor: () => C.line,
  paddingTop: () => 5, paddingBottom: () => 5, paddingLeft: () => 8, paddingRight: () => 8,
});

const builders: Record<ShiftSummarySection, (s: any, cfg: ReportConfig) => Block[]> = {
  header: (_s, cfg) => [
    {
      table: { widths: ['*'], body: [[{ text: cfg.stationName || 'PumpOS', style: 'brand' }], [{ text: 'SHIFT SUMMARY RECORD', style: 'title' }]] },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => C.green, paddingLeft: () => 16, paddingRight: () => 16, paddingTop: () => 12, paddingBottom: () => 12 },
      margin: [0, 0, 0, 4],
    },
    { text: 'Authoritative operational snapshot', style: 'muted', margin: [0, 0, 0, 10] },
  ],
  meta: (s) => [
    {
      columns: [
        { text: [{ text: 'SHIFT\n', style: 'label' }, { text: s.templateName || '—', style: 'val' }] },
        { text: [{ text: 'DURATION\n', style: 'label' }, { text: `${fmtTime(s.openedAt)} – ${fmtTime(s.closedAt)}`, style: 'val' }] },
        { text: [{ text: 'RECONCILED BY\n', style: 'label' }, { text: s.closedByName || s.closedBy || '—', style: 'val' }] },
      ],
      columnGap: 12, margin: [0, 0, 0, 4],
    },
  ],
  kpis: (s) => [
    {
      columns: [
        kpiBox('Total Volume', vol(s.totalVolumeSold), C.green),
        kpiBox('Expected Cash', inr(s.expectedCash)),
        kpiBox('Variance', inr(s.cashVariance), Number(s.cashVariance) < 0 ? C.danger : C.green),
      ],
      columnGap: 8, margin: [0, 10, 0, 4],
    },
  ],
  nozzles: (s) => [
    sectionHeading('Nozzle Reconciliation & Volume Sold'),
    {
      table: {
        headerRows: 1, widths: ['auto', '*', 'auto', 'auto', 'auto'],
        body: [
          ['Nozzle', 'Product', 'Opening', 'Closing', 'Volume'].map((t, i) => ({ text: t, style: 'th', alignment: i > 1 ? 'right' : 'left' })),
          ...(s.nozzleReadings || []).map((r: any) => [
            { text: r.nozzleName || r.nozzleNumber || '', style: 'tdStrong' },
            { text: r.productName || '', style: 'td' },
            { text: Number(r.openingReading ?? r.opening ?? 0).toFixed(3), style: 'tdr' },
            { text: Number(r.closingReading ?? r.closing ?? 0).toFixed(3), style: 'tdr' },
            { text: vol(r.volume ?? r.volumeSold), style: 'tdrb' },
          ]),
          [{ text: 'TOTAL FUEL SOLD', colSpan: 4, style: 'tdTotal' }, {}, {}, {}, { text: vol(s.totalVolumeSold), style: 'tdrTotal' }],
        ],
      },
      layout: zebra(5),
    },
  ],
  handovers: (s) => [
    sectionHeading('Attendant Handovers'),
    {
      table: {
        headerRows: 1, widths: ['*', 'auto', 'auto', 'auto'],
        body: [
          ['Attendant', 'Cash', 'Card/UPI', 'Credit'].map((t, i) => ({ text: t, style: 'th', alignment: i ? 'right' : 'left' })),
          ...(s.handovers || []).map((h: any) => [
            { text: h.attendantName || '', style: 'tdStrong' },
            { text: inr(h.cashHandedOver), style: 'tdr' },
            { text: inr((h.cardHandedOver || 0) + (h.upiHandedOver || 0)), style: 'tdr' },
            { text: inr(h.creditHandedOver), style: 'tdr' },
          ]),
        ],
      },
      layout: zebra(4),
    },
  ],
  collections: (s) => [
    sectionHeading('Non-Cash Payments'),
    { columns: [kpiBox('Card', inr(s.cardCollectionsSum)), kpiBox('UPI', inr(s.upiCollectionsSum)), kpiBox('Credit', inr(s.creditSalesSum))], columnGap: 8 },
  ],
  expenses: (s) => [sectionHeading('Petty Expenses'), kpiBox('Cash Expenses', inr(s.cashExpensesSum), C.amber)],
  variance: (s) => [
    { columns: [kpiBox('Opening Cash', inr(s.openingCash)), kpiBox('Closing Cash', inr(s.closingCash)), kpiBox('Variance', inr(s.cashVariance), Number(s.cashVariance) < 0 ? C.danger : C.green)], columnGap: 8, margin: [0, 12, 0, 4] },
  ],
  signatures: () => [
    { columns: [{ text: '___________________\nOperator', style: 'sign' }, { text: '___________________\nManager', style: 'sign' }], columnGap: 40, margin: [0, 36, 0, 0] },
  ],
};

function fmtTime(iso?: string) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); } catch { return '—'; }
}

export function buildShiftSummaryDoc(snapshot: any, config: ReportConfig = DEFAULT_SHIFT_SUMMARY_CONFIG): any {
  const content: Block[] = [];
  for (const key of config.sections) {
    const fn = builders[key];
    if (fn) content.push(...fn(snapshot, config));
  }
  return {
    pageSize: config.paper,
    pageMargins: [40, 40, 40, 48],
    footer: (current: number, total: number) => ({
      columns: [
        { text: `Generated ${new Date().toLocaleString('en-IN')}`, style: 'foot', alignment: 'left' },
        { text: `Page ${current} of ${total}`, style: 'foot', alignment: 'right' },
      ],
      margin: [40, 12, 40, 0],
    }),
    content,
    styles: {
      brand: { fontSize: 15, bold: true, color: '#FFFFFF' },
      title: { fontSize: 12, bold: true, color: '#FFFFFF', characterSpacing: 1.5, margin: [0, 3, 0, 0] },
      muted: { fontSize: 9, color: C.muted },
      h2: { fontSize: 10, bold: true, color: C.green, characterSpacing: 0.6 },
      label: { fontSize: 7.5, color: C.muted, characterSpacing: 0.4 },
      val: { fontSize: 11, bold: true, color: C.ink },
      kpiLabel: { fontSize: 7.5, color: C.muted, characterSpacing: 0.4 },
      kpiValue: { fontSize: 13, bold: true },
      th: { fontSize: 8.5, bold: true, color: '#FFFFFF' },
      td: { fontSize: 9.5, color: C.body },
      tdStrong: { fontSize: 9.5, bold: true, color: C.ink },
      tdr: { fontSize: 9.5, color: C.body, alignment: 'right' },
      tdrb: { fontSize: 9.5, bold: true, color: C.ink, alignment: 'right' },
      tdTotal: { fontSize: 9.5, bold: true, color: C.ink },
      tdrTotal: { fontSize: 10, bold: true, color: C.green, alignment: 'right' },
      sign: { fontSize: 9, color: C.muted, alignment: 'center' },
      foot: { fontSize: 7.5, color: C.muted },
    },
    defaultStyle: { fontSize: 10, color: C.body },
  };
}

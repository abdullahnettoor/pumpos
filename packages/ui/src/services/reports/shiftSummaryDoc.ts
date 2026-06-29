// Engine-agnostic Shift Summary report definitions. Pure functions: take the
// immutable snapshot + a station ReportConfig, return a pdfmake docDefinition.
// No DOM / Hono / DB imports, so the SAME builder runs client-side (preview /
// quick download) and server-side (Worker canonical PDF) later.

export type ShiftSummarySection =
  | 'header'
  | 'meta'
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
  sections: ['header', 'meta', 'nozzles', 'handovers', 'variance', 'signatures'],
  showLogo: true,
  paper: 'A4',
};

const inr = (n: any) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const vol = (n: any) => `${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} L`;

type Block = Record<string, unknown>;

const builders: Record<ShiftSummarySection, (s: any, cfg: ReportConfig) => Block[]> = {
  header: (_s, cfg) => [
    { text: cfg.stationName || 'PumpOS', style: 'brand', alignment: 'center' },
    { text: 'SHIFT SUMMARY RECORD', style: 'title', alignment: 'center' },
    { text: 'Authoritative Operational Snapshot', style: 'muted', alignment: 'center', margin: [0, 0, 0, 12] },
  ],
  meta: (s) => [
    {
      columns: [
        { text: [{ text: 'SHIFT\n', style: 'label' }, { text: s.templateName || '—', style: 'val' }] },
        { text: [{ text: 'DURATION\n', style: 'label' }, { text: `${fmtTime(s.openedAt)} – ${fmtTime(s.closedAt)}`, style: 'val' }] },
        { text: [{ text: 'RECONCILED BY\n', style: 'label' }, { text: s.closedByName || s.closedBy || '—', style: 'val' }] },
      ],
      margin: [0, 0, 0, 12],
    },
  ],
  nozzles: (s) => [
    { text: 'NOZZLE RECONCILIATION & VOLUME SOLD', style: 'h2' },
    {
      table: {
        headerRows: 1,
        widths: ['auto', '*', 'auto', 'auto', 'auto'],
        body: [
          ['Nozzle', 'Product', 'Opening', 'Closing', 'Volume'].map((t) => ({ text: t, style: 'th' })),
          ...(s.nozzleReadings || []).map((r: any) => [
            { text: r.nozzleName || r.nozzleNumber || '', style: 'td' },
            { text: r.productName || '', style: 'td' },
            { text: Number(r.openingReading ?? r.opening ?? 0).toFixed(3), style: 'tdr' },
            { text: Number(r.closingReading ?? r.closing ?? 0).toFixed(3), style: 'tdr' },
            { text: vol(r.volume ?? r.volumeSold), style: 'tdr' },
          ]),
          [{ text: 'TOTAL FUEL SOLD', colSpan: 4, style: 'tdb' }, {}, {}, {}, { text: vol(s.totalVolumeSold), style: 'tdb' }],
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 12],
    },
  ],
  handovers: (s) => [
    { text: 'ATTENDANT HANDOVERS', style: 'h2' },
    {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto', 'auto'],
        body: [
          ['Attendant', 'Cash', 'Card/UPI', 'Credit'].map((t) => ({ text: t, style: 'th' })),
          ...(s.handovers || []).map((h: any) => [
            { text: h.attendantName || '', style: 'td' },
            { text: inr(h.cashHandedOver), style: 'tdr' },
            { text: inr((h.cardHandedOver || 0) + (h.upiHandedOver || 0)), style: 'tdr' },
            { text: inr(h.creditHandedOver), style: 'tdr' },
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 12],
    },
  ],
  collections: (s) => [
    { text: 'NON-CASH PAYMENTS', style: 'h2' },
    { columns: [{ text: `Card: ${inr(s.cardCollectionsSum)}` }, { text: `UPI: ${inr(s.upiCollectionsSum)}` }, { text: `Credit: ${inr(s.creditSalesSum)}` }], margin: [0, 0, 0, 12] },
  ],
  expenses: (s) => [
    { text: 'PETTY EXPENSES', style: 'h2' },
    { text: inr(s.cashExpensesSum), margin: [0, 0, 0, 12] },
  ],
  variance: (s) => [
    {
      columns: [
        { text: [{ text: 'EXPECTED CASH\n', style: 'label' }, { text: inr(s.expectedCash), style: 'val' }] },
        { text: [{ text: 'CLOSING CASH\n', style: 'label' }, { text: inr(s.closingCash), style: 'val' }] },
        { text: [{ text: 'VARIANCE\n', style: 'label' }, { text: inr(s.cashVariance), style: 'val' }] },
      ],
      margin: [0, 8, 0, 16],
    },
  ],
  signatures: () => [
    { columns: [{ text: '________________\nOperator', style: 'muted', alignment: 'center' }, { text: '________________\nManager', style: 'muted', alignment: 'center' }], margin: [0, 24, 0, 0] },
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
    pageMargins: [36, 36, 36, 36],
    content,
    styles: {
      brand: { fontSize: 16, bold: true, color: '#1F6A53' },
      title: { fontSize: 14, bold: true, characterSpacing: 1 },
      muted: { fontSize: 9, color: '#5E6A61' },
      h2: { fontSize: 11, bold: true, margin: [0, 8, 0, 6] },
      label: { fontSize: 8, color: '#5E6A61' },
      val: { fontSize: 11, bold: true },
      th: { fontSize: 9, bold: true, color: '#5E6A61' },
      td: { fontSize: 10 },
      tdr: { fontSize: 10, alignment: 'right' },
      tdb: { fontSize: 10, bold: true },
    },
    defaultStyle: { fontSize: 10 },
  };
}

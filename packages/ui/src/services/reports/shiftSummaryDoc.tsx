import React from 'react';
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Font,
  Image,
  Svg,
  Path,
} from '@react-pdf/renderer';
import { MARK_VIEWBOX, MARK_PATH } from '../../pump-ds/brand/Brand.js';
import { formatDateTime, formatQuantity, formatSignedMoney } from '../../utils/format.js';
import { formatVariance } from '../../utils/variance.js';

// Embed Plus Jakarta Sans + Geist Mono (matches the app type; Mono is used
// for all numeric/currency cells and MUST carry the rupee glyph ₹ — Noto Sans
// Mono does, unlike JetBrains/Roboto Mono). TTFs vendored locally (npm run fonts).
Font.register({
  family: 'Plus Jakarta Sans',
  fonts: [
    { src: '/fonts/PlusJakartaSans-Regular.ttf' },
    { src: '/fonts/PlusJakartaSans-Bold.ttf', fontWeight: 700 },
  ],
});
Font.register({
  family: 'Geist Mono',
  fonts: [
    { src: '/fonts/GeistMono-Regular.ttf' },
    { src: '/fonts/GeistMono-Medium.ttf', fontWeight: 700 },
  ],
});

export type { ShiftSummarySection, ReportConfig } from './reportConfig.js';
export { DEFAULT_SHIFT_SUMMARY_CONFIG, SHIFT_SUMMARY_SECTION_LABELS } from './reportConfig.js';
export type { Letterhead } from './letterhead.js';
export { letterheadFromStation } from './letterhead.js';
import type { StatusTone } from '@pump/shared';
import type { ShiftSummarySection, ReportConfig } from './reportConfig.js';
import { DEFAULT_SHIFT_SUMMARY_CONFIG } from './reportConfig.js';
import type { Letterhead } from './letterhead.js';
import {
  creditTotalNotes,
  fuelTotalNotes,
  readShiftSummary,
  totalNote,
  volumeTotalNotes,
  type ShiftSummary,
} from '../../components/Shifts/shiftSummaryModel.js';
import {
  CREDIT_COLUMNS,
  FUEL_COLUMNS,
  HANDOVER_COLUMNS,
  LEGACY_PURCHASE_COLUMNS,
  NOZZLE_COLUMNS,
  NOZZLES_EMPTY,
  SHIFT_SUMMARY_TITLES as TITLES,
  SIGNATURE_LINES,
  TERMINAL_COLUMNS,
  cashLineText,
  creditTotalRow,
  fuelTotalRow,
  handoverTotalRow,
  legacyPurchaseRows,
  legacyPurchaseTotalRow,
  nozzleTotalRow,
  snapshotNote,
  summaryDetails,
  terminalTotalRow,
} from '../../components/Shifts/shiftSummaryColumns.js';
import {
  closeDrawerTotal,
  drawerColumns,
  drawerRows,
  drawerTotalRow,
  type CloseDrawerRow,
} from '../../components/Shifts/DrawerReconciliationTable.js';
import { PdfScreenTable, PdfTitle } from './pdfScreenTable.js';

export const C = {
  green: '#1F6A53',
  ink: '#18201A',
  body: '#2B342D',
  muted: '#5E6A61',
  faint: '#7A857C',
  line: '#D9DED6',
  surfaceAlt: '#F1F3EF',
  danger: '#9F3F36',
  amber: '#8A6116',
  success: '#1E6A4E',
  warnBg: '#F9F0DA',
  warnFg: '#8A6116',
  white: '#FFFFFF',
};

/**
 * Shared tones on paper (#518): balanced green, surplus amber, short red. Hex,
 * since react-pdf has no CSS variables; exhaustive over `StatusTone`, so a new
 * tone fails here at compile time.
 */
const PDF_TONE = {
  success: C.success,
  warning: C.amber,
  danger: C.danger,
  info: C.ink,
  neutral: C.muted,
} satisfies Record<StatusTone, string>;

/** PDF money: paise kept, a negative signed `−₹1,200.00` (the app's one signed-money rule). */
export const inr = (n: any) => formatSignedMoney(n);
/** PDF money in whole rupees: `−₹1,200`. */
export const inr0 = (n: any) => formatSignedMoney(n, { decimals: 0 });
// The shared quantity format with 3 decimals (meter and dip readings). A
// missing figure prints 0, as these PDFs always have, not the screen's `—`.
const reading = (n: any) => Number(n) || 0;
export const vol3 = (n: any) => formatQuantity(reading(n), 'L', { decimals: 3 });
/** PDF date + time: the app's one format (`11 Jul 2026, 06:30 am`), `—` when missing. */
export const fmtDateTime = (iso?: string) => formatDateTime(iso);

export const s = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingHorizontal: 32,
    paddingBottom: 46,
    fontSize: 9,
    color: C.body,
    fontFamily: 'Plus Jakarta Sans',
  },
  band: { backgroundColor: C.green, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 6 },
  brand: { fontSize: 15, color: C.white, fontWeight: 700 },
  title: { fontSize: 11, color: C.white, marginTop: 3, letterSpacing: 1.5, fontWeight: 700 },
  sub: { fontSize: 8.5, color: C.muted, marginTop: 6 },
  metaBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: C.surfaceAlt,
    borderRadius: 6,
    padding: 12,
    marginTop: 12,
  },
  metaCell: { width: '22%', minWidth: 110 },
  label: { fontSize: 7, color: C.muted },
  val: { fontSize: 10, color: C.ink, fontWeight: 700, marginTop: 2 },
  valMono: { fontSize: 10, color: C.ink, fontFamily: 'Geist Mono', marginTop: 2 },
  h2: {
    fontSize: 9.5,
    color: C.green,
    fontWeight: 700,
    marginTop: 16,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  warn: { backgroundColor: C.warnBg, borderRadius: 6, padding: 10, marginTop: 12 },
  warnTitle: { fontSize: 8.5, color: C.warnFg, fontWeight: 700, marginBottom: 4 },
  warnItem: { fontSize: 8.5, color: C.warnFg, marginTop: 2 },
  tr: { flexDirection: 'row', alignItems: 'flex-start' },
  thRow: { backgroundColor: C.green, borderRadius: 3 },
  th: { color: C.white, fontSize: 7.5, fontWeight: 700, paddingVertical: 5, paddingHorizontal: 6 },
  cell: { fontSize: 8.5, paddingVertical: 4, paddingHorizontal: 6, color: C.body },
  cellStrong: {
    fontSize: 8.5,
    paddingVertical: 4,
    paddingHorizontal: 6,
    color: C.ink,
    fontWeight: 700,
  },
  cellMono: {
    fontSize: 8.5,
    paddingVertical: 4,
    paddingHorizontal: 6,
    color: C.body,
    fontFamily: 'Geist Mono',
  },
  cellMonoStrong: {
    fontSize: 8.5,
    paddingVertical: 4,
    paddingHorizontal: 6,
    color: C.ink,
    fontFamily: 'Geist Mono',
    fontWeight: 700,
  },
  zebra: { backgroundColor: C.surfaceAlt },
  totalRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.surfaceAlt,
  },
  totalLabel: {
    flex: 1,
    fontSize: 8,
    paddingVertical: 5,
    paddingHorizontal: 6,
    color: C.muted,
    fontWeight: 700,
  },
  reconRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  reconBox: {
    borderWidth: 0.5,
    borderColor: C.line,
    borderRadius: 6,
    marginTop: 4,
    marginBottom: 8,
  },
  kpiRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  kpi: { flex: 1, backgroundColor: C.surfaceAlt, borderRadius: 6, padding: 8 },
  kpiLabel: { fontSize: 7, color: C.muted },
  kpiVal: { fontSize: 12, fontFamily: 'Geist Mono', marginTop: 3 },
  signRow: { flexDirection: 'row', gap: 40, marginTop: 36 },
  sign: {
    flex: 1,
    fontSize: 8.5,
    color: C.muted,
    textAlign: 'center',
    borderTopWidth: 0.5,
    borderTopColor: C.muted,
    paddingTop: 4,
  },
  foot: {
    position: 'absolute',
    bottom: 22,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: C.muted,
  },
});

// --- Generic table -----------------------------------------------------------
export type Col = {
  header: string;
  flex: number;
  /**
   * The share is the column's whole width (`flexBasis: 0`), whatever its
   * text, so a total row whose label spans columns lines up with the rows.
   */
  fixed?: boolean;
  align?: 'right';
  mono?: boolean;
  strong?: boolean;
};
export type Cell = {
  text: string;
  color?: string;
  /** A muted second line under `text` (a statement row's facts). */
  detail?: string;
};

/** A cell's horizontal padding (`s.cell`), each side. */
const CELL_PAD = 6;

/** A cell's width: its share of the row, fixed or grown from its text. */
const width = (c: Col) =>
  c.fixed ? { flexGrow: c.flex, flexShrink: 1, flexBasis: 0 } : { flex: c.flex };

/** One cell of a table row: its text, and the detail line under it when there is one. */
const cellView = (cell: Cell, c: Col, base: any, tone?: string, key?: number) => {
  const align = c.align === 'right' ? { textAlign: 'right' as const } : {};
  const color = tone ? { color: tone } : {};
  if (!cell.detail) {
    return (
      <Text key={key} style={[base, width(c), align, color]}>
        {cell.text}
      </Text>
    );
  }
  return (
    <View key={key} style={[width(c), { paddingVertical: 4, paddingHorizontal: 6 }]}>
      <Text style={[base, { paddingVertical: 0, paddingHorizontal: 0 }, align, color]}>
        {cell.text}
      </Text>
      <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>{cell.detail}</Text>
    </View>
  );
};

/** A row with a second line never splits across pages; a plain row is left as it was. */
const noSplit = (cells: Cell[]) => (cells.some((cell) => cell.detail) ? { wrap: false } : {});

/** How many leading cells the label takes: itself and the empty cells after it. */
const labelSpan = (row: Cell[]): number => {
  let n = 1;
  while (n < row.length - 1 && !row[n].text) n++;
  return n;
};

/** The columns with the first `span` merged into one, left-aligned, for a label. */
const spanColumns = (columns: Col[], span: number): Col[] => [
  {
    header: '',
    flex: columns.slice(0, span).reduce((a, c) => a + c.flex, 0),
    fixed: columns[0].fixed,
  },
  ...columns.slice(span),
];

const baseStyle = (c: Col) =>
  c.mono ? (c.strong ? s.cellMonoStrong : s.cellMono) : c.strong ? s.cellStrong : s.cell;

export const TableView = ({
  columns,
  rows,
  total,
  totals,
  lead,
  spanLabel,
  keepHeader,
}: {
  columns: Col[];
  rows: Cell[][];
  total?: Cell[];
  totals?: Cell[][];
  /** A bold line before the first row: a statement's opening balance. */
  lead?: Cell[];
  /**
   * A total row's label runs across the empty cells after it, so a long label
   * ("Total of 3 nozzles") does not wrap in a narrow first column.
   */
  spanLabel?: boolean;
  /** The header row never splits or ends a page: it keeps at least its first row. */
  keepHeader?: boolean;
}) => (
  <View>
    <View style={[s.tr, s.thRow]} {...(keepHeader && { wrap: false, minPresenceAhead: 20 })}>
      {columns.map((c, i) => (
        <Text key={i} style={[s.th, width(c), c.align === 'right' ? { textAlign: 'right' } : {}]}>
          {c.header}
        </Text>
      ))}
    </View>
    {lead ? (
      <View wrap={false} style={[s.tr, { backgroundColor: C.surfaceAlt, marginBottom: 2 }]}>
        {lead.map((cell, ci) =>
          cellView(
            cell,
            columns[ci],
            columns[ci].mono ? s.cellMonoStrong : s.cellStrong,
            cell.color ?? C.ink,
            ci,
          ),
        )}
      </View>
    ) : null}
    {rows.map((cells, ri) => (
      <View key={ri} {...noSplit(cells)} style={[s.tr, ri % 2 === 1 ? s.zebra : {}]}>
        {cells.map((cell, ci) =>
          cellView(cell, columns[ci], baseStyle(columns[ci]), cell.color, ci),
        )}
      </View>
    ))}
    {[...(total ? [total] : []), ...(totals ?? [])].map((tRow, ti) => {
      const span = spanLabel ? labelSpan(tRow) : 1;
      const cols = span > 1 ? spanColumns(columns, span) : columns;
      const cells = span > 1 ? [tRow[0], ...tRow.slice(span)] : tRow;
      return (
        <View key={`t${ti}`} {...noSplit(tRow)} style={s.totalRow}>
          {cells.map((cell, ci) =>
            cellView(
              cell,
              cols[ci],
              ci === 0 && span > 1
                ? // The spanned cells' padding too, so the figures after it line up.
                  { ...s.cellStrong, paddingRight: CELL_PAD + 2 * CELL_PAD * (span - 1) }
                : cols[ci].mono
                  ? s.cellMonoStrong
                  : s.cellStrong,
              cell.color ?? C.ink,
              ci,
            ),
          )}
        </View>
      );
    })}
  </View>
);

export const Kpi = ({ l, v, c = C.ink }: { l: string; v: string; c?: string }) => (
  <View style={s.kpi}>
    <Text style={s.kpiLabel}>{l.toUpperCase()}</Text>
    <Text style={[s.kpiVal, { color: c }]}>{v}</Text>
  </View>
);

export const varColor = (v: number) => (v < 0 ? C.danger : v > 0 ? C.amber : C.success);

/**
 * Branded report header: green band with legal/station name + a doc title, the
 * platform's PumpOS mark, an optional uploaded logo, and a legal sub-line
 * (GSTIN · RO code · brand · address). Shared by all four PDF documents.
 */
export const LetterheadBand = ({
  title,
  stationName,
  letterhead,
  showLogo: showLogoProp,
}: {
  title: string;
  stationName?: string;
  letterhead?: Letterhead;
  showLogo?: boolean;
}) => {
  const lh = letterhead || {};
  const showLogo = showLogoProp ?? lh.showLogo ?? true;
  const heading = lh.legalName || stationName || 'PumpOS';
  const legalBits = [
    lh.gstin ? `GSTIN: ${lh.gstin}` : '',
    lh.roCode ? `RO: ${lh.roCode}` : '',
    lh.fuelBrand || '',
    [lh.addressLine, lh.pincode].filter(Boolean).join(', '),
    lh.contact || '',
  ]
    .filter(Boolean)
    .join('  •  ');
  return (
    <View>
      <View style={s.band}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Svg viewBox={MARK_VIEWBOX} width={21.3} height={24}>
              <Path d={MARK_PATH} fill={C.white} fillRule="evenodd" />
            </Svg>
            <View>
              <Text style={s.brand}>{heading}</Text>
              <Text style={s.title}>{title}</Text>
            </View>
          </View>
          {showLogo && lh.logoDataUrl ? (
            <Image src={lh.logoDataUrl} style={{ width: 48, height: 48, objectFit: 'contain' }} />
          ) : null}
        </View>
      </View>
      {legalBits ? <Text style={[s.sub, { marginTop: 4 }]}>{legalBits}</Text> : null}
    </View>
  );
};

/*
 * The Shift Summary PDF reads the snapshot through `readShiftSummary`, the
 * screen's model, and prints the screen's columns, total rows, titles, notes
 * and words (#595): stored totals as stored (a missing one blank, with a
 * note), `—` for volumes across L and kg, 2-decimal volumes and 3-decimal
 * meter readings, Short / Surplus / Balanced. It never recomputes a figure.
 */

/**
 * The PDF's inputs besides the snapshot: the station's timezone, for its
 * times. Paper prints absolute dates only: the screen's business-day line is
 * advice relative to now, so the PDF leaves it out.
 */
export interface ShiftSummaryClock {
  timeZone?: string;
}

/** A variance tints only when it is a problem: a shortage red, a surplus amber. */
const problemInk = (amount: number | null | undefined): string | undefined => {
  if (amount == null) return undefined;
  const { tone } = formatVariance(amount, 'cash');
  return tone === 'danger' || tone === 'warning' ? PDF_TONE[tone] : undefined;
};
const varianceInk =
  <T,>(pick: (row: T) => number | null) =>
  (col: { id: string }, row: T) =>
    col.id === 'variance' ? problemInk(pick(row)) : undefined;

/**
 * Whether a table section may break across pages. A short one (a title and up
 * to 12 rows) moves to the next page whole, so a title never ends a page.
 */
const breaks = (rows: unknown[]): boolean => rows.length > 12;

interface Ctx {
  summary: ShiftSummary;
  clock: ShiftSummaryClock;
  config: ReportConfig;
}

const builders: Record<ShiftSummarySection, (ctx: Ctx) => React.ReactNode> = {
  header: ({ summary, clock, config }) => {
    const taken = snapshotNote(summary, clock.timeZone);
    return (
      <View key="header">
        <LetterheadBand
          title={TITLES.page.toUpperCase()}
          stationName={config.stationName}
          letterhead={config.letterhead}
          showLogo={config.showLogo}
        />
        <Text style={s.sub}>{`${summary.label} \u00b7 ${summary.template}`}</Text>
        {taken && <Text style={[s.sub, { marginTop: 2 }]}>{taken}</Text>}
      </View>
    );
  },
  meta: ({ summary, clock }) => {
    return (
      <View key="meta">
        <View style={s.metaBox}>
          {summaryDetails(summary, clock.timeZone).map(([label, value]) => (
            <View key={label} style={s.metaCell}>
              <Text style={s.label}>{label.toUpperCase()}</Text>
              <Text style={[s.val, { fontSize: 9 }]}>{value}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  },
  warnings: ({ summary }) =>
    summary.warnings.length > 0 ? (
      <View key="warnings" style={s.warn}>
        <Text style={s.warnTitle}>{TITLES.warnings}</Text>
        {summary.warnings.map((w, i) => (
          <Text key={i} style={s.warnItem}>
            {`\u2022 ${w}`}
          </Text>
        ))}
      </View>
    ) : null,
  // The nozzle table always prints, empty or not, as on screen; fuel by
  // product (no section of its own in a station's layout) follows it.
  nozzles: ({ summary }) => (
    <View key="nozzles">
      <View wrap={breaks(summary.nozzles)}>
        <PdfTitle title={TITLES.nozzles} subtitle={TITLES.nozzlesSubtitle} />
        <PdfScreenTable
          columns={NOZZLE_COLUMNS}
          rows={summary.nozzles}
          flex={{ product: 1.5, opening: 1.5, closing: 1.5, gross: 1.2, net: 1.2 }}
          totalRow={nozzleTotalRow(summary)}
          note={totalNote(volumeTotalNotes(summary.volumes))}
          empty={NOZZLES_EMPTY}
        />
      </View>
      {summary.fuel.length > 0 && (
        <View wrap={breaks(summary.fuel)}>
          <PdfTitle title={TITLES.fuel} />
          <PdfScreenTable
            columns={FUEL_COLUMNS}
            rows={summary.fuel}
            totalRow={fuelTotalRow(summary)}
            note={totalNote(fuelTotalNotes(summary))}
            empty=""
          />
        </View>
      )}
    </View>
  ),
  handovers: ({ summary }) =>
    summary.handovers.length > 0 ? (
      <View key="handovers" wrap={breaks(summary.handovers)}>
        <PdfTitle title={TITLES.handovers} />
        <PdfScreenTable
          columns={HANDOVER_COLUMNS}
          rows={summary.handovers}
          flex={{ cash: 1.2, cardUpi: 1.2, expected: 1.4 }}
          totalRow={handoverTotalRow(summary)}
          empty=""
          tone={varianceInk((r) => r.variance)}
          totalTone={(col) =>
            col.id === 'variance' ? problemInk(summary.handoverVariance) : undefined
          }
        />
      </View>
    ) : null,
  terminals: ({ summary }) =>
    summary.terminals.length > 0 ? (
      <View key="terminals" wrap={breaks(summary.terminals)}>
        <PdfTitle title={TITLES.terminals} />
        <PdfScreenTable
          columns={TERMINAL_COLUMNS}
          rows={summary.terminals}
          flex={{ terminal: 1.6, handledBy: 2.4 }}
          totalRow={terminalTotalRow(summary)}
          empty=""
        />
      </View>
    ) : null,
  creditSales: ({ summary }) =>
    summary.credit.length > 0 ? (
      <View key="creditSales" wrap={breaks(summary.credit)}>
        <PdfTitle title={TITLES.credit} />
        <PdfScreenTable
          columns={CREDIT_COLUMNS}
          rows={summary.credit}
          flex={{ customer: 1.3, vehicle: 1.4, notes: 1.3, amount: 1.2 }}
          totalRow={creditTotalRow(summary)}
          note={totalNote(creditTotalNotes(summary))}
          empty=""
        />
      </View>
    ) : null,
  cashRecon: ({ summary }) => (
    <View key="cashRecon" wrap={false}>
      <PdfTitle title={TITLES.cash} />
      <View style={s.reconBox}>
        {summary.cash.map((line, i) => {
          const result = line.role === 'result';
          const ink = line.role === 'variance' ? (problemInk(line.amount) ?? C.ink) : C.ink;
          return (
            <View
              key={line.key}
              style={[
                s.reconRow,
                result ? { backgroundColor: C.surfaceAlt } : {},
                i === summary.cash.length - 1 ? { borderBottomWidth: 0 } : {},
              ]}
            >
              <Text style={{ fontSize: 9, color: C.body, fontWeight: result ? 700 : 400 }}>
                {line.label}
              </Text>
              <Text style={{ fontSize: 9, color: ink, fontFamily: 'Geist Mono', fontWeight: 700 }}>
                {cashLineText(line)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  ),
  // Office Records (collections, expenses) never appear on a Shift Summary
  // (ADR 0005); saved configs naming those old sections simply skip them.
  // The screen's Drawers table (#534): its rows, columns and total row, with
  // the variance total in words (`texts`).
  drawers: ({ summary }) => {
    if (summary.drawers.length === 0) return null;
    const rows = drawerRows(summary.drawers);
    const total = closeDrawerTotal(rows);
    const totalRow = drawerTotalRow(rows, total);
    const handedOver = rows.some((r) => !r.pending);
    return (
      <View key="drawers" wrap={breaks(rows)}>
        <PdfTitle title={TITLES.drawers} subtitle={TITLES.drawersSubtitle} />
        <PdfScreenTable
          columns={drawerColumns()}
          rows={rows}
          // Eight columns: room for a lakh-sized total (₹1,40,000.00) in each figure.
          flex={{
            drawer: 1.1,
            status: 1,
            openingFloat: 1.15,
            cashSales: 1.15,
            drops: 1.15,
            expected: 1.15,
            declared: 1.15,
            variance: 1.15,
          }}
          totalRow={totalRow}
          empty=""
          tone={varianceInk((r: CloseDrawerRow) => r.variance)}
          totalTone={(col) =>
            col.id === 'variance' && handedOver ? problemInk(total.variance) : undefined
          }
        />
      </View>
    );
  },
  signatures: () => (
    <View key="signatures" style={s.signRow}>
      {SIGNATURE_LINES.map((who) => (
        <Text key={who} style={s.sign}>
          {who}
        </Text>
      ))}
    </View>
  ),
};

/**
 * Older snapshots stored the shift's purchases; print them as they were saved,
 * as the screen does. New snapshots carry none (#308), so this prints nothing.
 */
function legacyPurchasesSection(snapshot: unknown): React.ReactNode {
  const rows = legacyPurchaseRows(snapshot);
  if (rows.length === 0) return null;
  return (
    <View key="purchases" wrap={breaks(rows)}>
      <PdfTitle title={TITLES.legacyPurchases} />
      <PdfScreenTable
        columns={LEGACY_PURCHASE_COLUMNS}
        rows={rows}
        totalRow={legacyPurchaseTotalRow(rows)}
        empty=""
      />
    </View>
  );
}

/**
 * The snapshot as the screen reads it. `generateShiftSummaryPdf` puts the
 * read's `businessDate` and `shiftSequence` on the snapshot.
 */
const readSnapshot = (snapshot: Record<string, any>): ShiftSummary =>
  readShiftSummary({
    shiftId: snapshot.shiftId,
    businessDate: snapshot.businessDate ?? null,
    shiftSequence: snapshot.shiftSequence ?? null,
    snapshotData: snapshot,
  });

export const ShiftSummaryDoc: React.FC<{
  snapshot: any;
  config?: ReportConfig;
  clock?: ShiftSummaryClock;
}> = ({ snapshot, config = DEFAULT_SHIFT_SUMMARY_CONFIG, clock = {} }) => {
  const ctx: Ctx = { summary: readSnapshot(snapshot ?? {}), clock, config };
  return (
    <Document>
      <Page size={config.paper} style={s.page}>
        {config.sections.map((key) =>
          key === 'signatures' ? (
            <React.Fragment key="signatures">
              {legacyPurchasesSection(snapshot)}
              {builders.signatures(ctx)}
            </React.Fragment>
          ) : (
            builders[key]?.(ctx)
          ),
        )}
        {!config.sections.includes('signatures') && legacyPurchasesSection(snapshot)}
        <View style={s.foot} fixed>
          <Text>Generated {formatDateTime(new Date())}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};

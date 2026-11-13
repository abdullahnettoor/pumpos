import React from 'react';
import { Document, Font, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { formatQuantity, formatSignedMoney } from '../../../utils/format.js';
import { C, s, Kpi, LetterheadBand, type Letterhead } from '../shiftSummaryDoc.js';

/*
 * Shared kit for the report proposal PDFs (docs/report-proposals). Each
 * proposal is a real react-pdf document on the same primitives as the shipped
 * reports (letterhead band, KPI tiles, green table header, footer), so a
 * template ports into the real export once its report is built.
 */

export { C, s, Kpi, LetterheadBand };
export type { Letterhead };

/** A filter the report offers, and the value this sample prints with. */
export interface FilterItem {
  label: string;
  value: string;
  /** Needs a group-B addition before it can exist: prints a `*`. */
  proposed?: boolean;
}

/** One "Data source & notes" line; `needs` names the group-B addition it waits on. */
export interface NoteLine {
  text: string;
  needs?: string;
}

/** What every proposal prints around its body: header, filters, notes, footer. */
export interface ProposalFrame {
  /** Upper-case document title in the letterhead band. */
  title: string;
  /** One line under the band: what the report answers. */
  subtitle?: string;
  filters: FilterItem[];
  notes: NoteLine[];
  letterhead?: Letterhead;
  stationName?: string;
  /** Fixed, printed as-is ("02 Nov 2026, 10:00 am"): proposals render deterministically. */
  generatedLabel: string;
}

/** Fixed PDF metadata date, so a re-render is byte-for-byte stable. */
export const PROPOSAL_CREATED = new Date('2026-11-02T04:30:00.000Z');

/** Who prints the report and when: the part of the frame the data does not decide. */
export type ProposalContext = Pick<ProposalFrame, 'letterhead' | 'stationName' | 'generatedLabel'>;

/** Register the app fonts from a directory on disk (the render script, outside a webview). */
export function registerProposalFonts(fontsDir: string): void {
  const at = (f: string) => `${fontsDir.replace(/\/$/, '')}/${f}`;
  Font.clear();
  Font.register({
    family: 'Plus Jakarta Sans',
    fonts: [
      { src: at('PlusJakartaSans-Regular.ttf') },
      { src: at('PlusJakartaSans-Bold.ttf'), fontWeight: 700 },
    ],
  });
  Font.register({
    family: 'Geist Mono',
    fonts: [
      { src: at('GeistMono-Regular.ttf') },
      { src: at('GeistMono-Medium.ttf'), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}

// --- Formatting -------------------------------------------------------------

/** Money without the ₹ (the column header carries it): `1,23,456.50`, `−1,200.00`. */
export const amt = (n: number) => formatSignedMoney(n, { symbol: false });
/** Money with the ₹ (KPIs, notes): `₹1,23,456.50`. */
export const rs = (n: number) => formatSignedMoney(n);
/** Whole rupees with the ₹: `₹1,23,457`. */
export const rs0 = (n: number) => formatSignedMoney(n, { decimals: 0 });
/** A signed money variance: `+250.00`, `−1,200.00`. */
export const amtSigned = (n: number) => formatSignedMoney(n, { symbol: false, plus: true });
/** A quantity in its unit: `1,234.50 L`, `24 nos`. */
export const qty = (n: number, unit: string, decimals?: number) =>
  formatQuantity(n, unit, decimals === undefined ? {} : { decimals });
/** A plain grouped number: `1,234.50`; `plus` signs a positive (`+12.40`), a negative is `−8.00`. */
export const num = (n: number, decimals = 2, plus = false) => {
  const shown = Number(Math.abs(n).toFixed(decimals));
  const body = (shown === 0 ? 0 : Math.abs(n)).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (shown === 0) return body;
  return `${n < 0 ? '\u2212' : plus ? '+' : ''}${body}`;
};
/** A signed plain number: `+12.40`, `−8.00`. */
export const numSigned = (n: number, decimals = 2) => num(n, decimals, true);
/** A percentage: `18.2%`; `plus` signs a change. */
export const pct = (n: number, decimals = 1, plus = false) => `${num(n, decimals, plus)}%`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `2026-10-05` → `05 Oct 2026`. */
export const dLong = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
};
/** `2026-10-05` → `05 Oct`. */
export const dShort = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d} ${MONTHS[Number(m) - 1]}`;
};

/** A variance's ink: red when short (negative), amber when excess, none when nil. */
export const varTone = (n: number, tolerance = 0.005): string | undefined =>
  n < -tolerance ? C.danger : n > tolerance ? C.amber : undefined;

// --- Table -----------------------------------------------------------------

export type PCol = {
  header: string;
  flex: number;
  align?: 'right' | 'center';
  mono?: boolean;
  strong?: boolean;
  /** Depends on a group-B addition: header prints `*` and a lighter ink. */
  proposed?: boolean;
};

export type PCell = string | { text: string; color?: string; detail?: string; bold?: boolean };

export type PRow =
  | { kind?: 'row'; cells: PCell[]; highlight?: 'warn' | 'danger' | 'muted' }
  /** A band naming the group the rows under it belong to. */
  | { kind: 'group'; label: string; detail?: string }
  /** A group subtotal; the label spans the empty cells after it. */
  | { kind: 'subtotal'; cells: PCell[] }
  /** The grand total (bold, ruled). */
  | { kind: 'total'; cells: PCell[] }
  /** An opening/brought-forward line, bold on a tinted band. */
  | { kind: 'lead'; cells: PCell[] };

type ViewStyle = Exclude<React.ComponentProps<typeof View>['style'], unknown[] | undefined>;

const ps = StyleSheet.create({
  th: { color: C.white, fontSize: 7, fontWeight: 700, paddingVertical: 4, paddingHorizontal: 4 },
  td: { fontSize: 7.5, paddingVertical: 3, paddingHorizontal: 4, color: C.body },
  tdMono: {
    fontSize: 7.5,
    paddingVertical: 3,
    paddingHorizontal: 4,
    color: C.body,
    fontFamily: 'Geist Mono',
  },
  group: {
    fontSize: 7.5,
    fontWeight: 700,
    color: C.green,
    paddingVertical: 4,
    paddingHorizontal: 4,
    letterSpacing: 0.4,
  },
  subtotal: { backgroundColor: '#F6F7F4', borderTopWidth: 0.5, borderTopColor: C.line },
  total: { backgroundColor: C.surfaceAlt, borderTopWidth: 1, borderTopColor: C.green },
  warn: { backgroundColor: C.warnBg },
  danger: { backgroundColor: '#F6E3E0' },
  filterBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 0.5,
    borderColor: C.line,
    borderRadius: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginTop: 8,
    gap: 4,
  },
  filterItem: { flexDirection: 'row', marginRight: 10 },
  filterLabel: { fontSize: 7, color: C.muted, marginRight: 3 },
  filterVal: { fontSize: 7, color: C.ink, fontWeight: 700 },
  notes: {
    marginTop: 14,
    borderTopWidth: 0.5,
    borderTopColor: C.line,
    paddingTop: 6,
  },
  notesTitle: { fontSize: 7, color: C.muted, fontWeight: 700, letterSpacing: 0.8, marginBottom: 3 },
  note: { fontSize: 7, color: C.body, marginTop: 1.5, lineHeight: 1.35 },
  needs: { color: C.amber },
  proposalTag: {
    fontSize: 6.5,
    color: C.amber,
    backgroundColor: C.warnBg,
    borderRadius: 3,
    paddingVertical: 1.5,
    paddingHorizontal: 4,
  },
});

const cellOf = (c: PCell) => (typeof c === 'string' ? { text: c } : c);
const align = (col: PCol) =>
  col.align === 'right'
    ? { textAlign: 'right' as const }
    : col.align === 'center'
      ? { textAlign: 'center' as const }
      : {};

const CellView = ({ col, cell, bold }: { col: PCol; cell: PCell; bold?: boolean }) => {
  const c = cellOf(cell);
  const base = col.mono ? ps.tdMono : ps.td;
  const weight = bold || c.bold || col.strong ? { fontWeight: 700 as const, color: C.ink } : {};
  const color = c.color ? { color: c.color } : {};
  return (
    <View style={{ flexGrow: col.flex, flexShrink: 1, flexBasis: 0 }}>
      <Text style={[base, align(col), weight, color]}>{c.text}</Text>
      {c.detail ? (
        <Text
          style={[
            {
              fontSize: 6.5,
              color: C.muted,
              paddingHorizontal: 4,
              marginTop: -2,
              paddingBottom: 2,
            },
            align(col),
          ]}
        >
          {c.detail}
        </Text>
      ) : null}
    </View>
  );
};

/** How many leading cells a total's label takes: itself and the empty cells after it. */
const span = (cells: PCell[]) => {
  let n = 1;
  while (n < cells.length - 1 && !cellOf(cells[n]).text) n++;
  return n;
};

const SpannedRow = ({ cols, cells, style }: { cols: PCol[]; cells: PCell[]; style: ViewStyle }) => {
  const n = span(cells);
  const label: PCol = { header: '', flex: cols.slice(0, n).reduce((a, c) => a + c.flex, 0) };
  return (
    <View wrap={false} style={[{ flexDirection: 'row' }, style]}>
      <CellView col={label} cell={cells[0]} bold />
      {cells.slice(n).map((cell, i) => (
        <CellView key={i} col={cols[n + i]} cell={cell} bold />
      ))}
    </View>
  );
};

/**
 * The proposals' one table: green header, zebra rows, group bands, subtotal
 * and grand-total rows. Rows never split; the header repeats on no page (a
 * long register reads top to bottom).
 */
export const PTable = ({ cols, rows }: { cols: PCol[]; rows: PRow[] }) => {
  // Zebra stripes restart under each group band.
  const stripe: boolean[] = [];
  let n = 0;
  for (const r of rows) {
    if (r.kind === 'group') n = 0;
    stripe.push(!r.kind || r.kind === 'row' ? n++ % 2 === 1 : false);
  }
  return (
    <View>
      <View style={[{ flexDirection: 'row' }, s.thRow]} fixed minPresenceAhead={30}>
        {cols.map((c, i) => (
          <View key={i} style={{ flexGrow: c.flex, flexShrink: 1, flexBasis: 0 }}>
            <Text style={[ps.th, align(c), c.proposed ? { color: '#CFE3DA' } : {}]}>
              {c.header}
              {c.proposed ? '*' : ''}
            </Text>
          </View>
        ))}
      </View>
      {rows.map((r, i) => {
        if (r.kind === 'group') {
          return (
            <View key={i} wrap={false} minPresenceAhead={24} style={{ flexDirection: 'row' }}>
              <Text style={ps.group}>
                {r.label.toUpperCase()}
                {r.detail ? (
                  <Text style={{ color: C.muted, fontWeight: 400 }}>{`  ${r.detail}`}</Text>
                ) : null}
              </Text>
            </View>
          );
        }
        if (r.kind === 'subtotal')
          return <SpannedRow key={i} cols={cols} cells={r.cells} style={ps.subtotal} />;
        if (r.kind === 'total')
          return <SpannedRow key={i} cols={cols} cells={r.cells} style={ps.total} />;
        if (r.kind === 'lead')
          return (
            <SpannedRow
              key={i}
              cols={cols}
              cells={r.cells}
              style={{ backgroundColor: C.surfaceAlt }}
            />
          );
        const tint =
          r.highlight === 'warn'
            ? ps.warn
            : r.highlight === 'danger'
              ? ps.danger
              : stripe[i]
                ? s.zebra
                : {};
        return (
          <View key={i} wrap={false} style={[{ flexDirection: 'row' }, tint]}>
            {r.cells.map((cell, ci) => (
              <CellView
                key={ci}
                col={cols[ci]}
                cell={r.highlight === 'muted' ? { ...cellOf(cell), color: C.faint } : cell}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
};

// --- Frame -----------------------------------------------------------------

export const SectionTitle = ({ children, tag }: { children: string; tag?: string }) => (
  <View
    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
    wrap={false}
    minPresenceAhead={60}
  >
    <Text style={[s.h2, { marginTop: 14, marginBottom: 5 }]}>{children.toUpperCase()}</Text>
    {tag ? <Text style={[ps.proposalTag, { marginTop: 8 }]}>{tag}</Text> : null}
  </View>
);

export const KpiStrip = ({ items }: { items: { l: string; v: string; c?: string }[] }) => (
  <View style={[s.kpiRow, { marginTop: 10 }]}>
    {items.map((k) => (
      <Kpi key={k.l} l={k.l} v={k.v} c={k.c} />
    ))}
  </View>
);

/** The filters the report offers, with the values this copy was printed for. */
export const FilterBand = ({ filters }: { filters: FilterItem[] }) => (
  <View style={ps.filterBox}>
    <Text style={[ps.filterLabel, { fontWeight: 700, letterSpacing: 0.6 }]}>FILTERS</Text>
    {filters.map((f) => (
      <View key={f.label} style={ps.filterItem}>
        <Text style={ps.filterLabel}>
          {f.label}
          {f.proposed ? '*' : ''}
        </Text>
        <Text style={ps.filterVal}>{f.value}</Text>
      </View>
    ))}
  </View>
);

/** "Data source & notes": where each figure comes from, and what waits on group B. */
export const NotesBlock = ({ notes }: { notes: NoteLine[] }) => (
  <View style={ps.notes} wrap={false}>
    <Text style={ps.notesTitle}>DATA SOURCE & NOTES</Text>
    {notes.map((n, i) => (
      <Text key={i} style={ps.note}>
        {'\u2022  '}
        {n.text}
        {n.needs ? <Text style={ps.needs}>{`  (needs: ${n.needs})`}</Text> : null}
      </Text>
    ))}
  </View>
);

/** A small inline "proposed" tag, for a block that waits on a group-B addition. */
export const ProposedTag = ({ children }: { children: string }) => (
  <Text style={ps.proposalTag}>{children}</Text>
);

const Header = ({ frame }: { frame: ProposalFrame }) => (
  <View>
    <LetterheadBand
      title={frame.title}
      stationName={frame.stationName}
      letterhead={frame.letterhead}
      showLogo={false}
    />
    {frame.subtitle ? <Text style={[s.sub, { marginTop: 5 }]}>{frame.subtitle}</Text> : null}
    <FilterBand filters={frame.filters} />
  </View>
);

const Footer = ({ frame }: { frame: ProposalFrame }) => (
  <View style={s.foot} fixed>
    <Text>{`PumpOS \u2022 Report proposal \u2022 sample data, not live figures \u2022 Generated ${frame.generatedLabel}`}</Text>
    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
  </View>
);

/**
 * One proposal document: letterhead, filter band, the body, the notes block
 * and the footer. `pages` puts each body on its own page (each page repeats
 * the header); the notes print once, after the last.
 */
export const ProposalDoc = ({
  frame,
  orientation = 'portrait',
  pages,
}: {
  frame: ProposalFrame;
  orientation?: 'portrait' | 'landscape';
  pages: React.ReactNode[];
}) => (
  <Document
    title={frame.title}
    author="PumpOS"
    producer="PumpOS"
    creator="PumpOS report proposals"
    creationDate={PROPOSAL_CREATED}
    modificationDate={PROPOSAL_CREATED}
  >
    {pages.map((body, i) => (
      <Page key={i} size="A4" orientation={orientation} style={[s.page, { paddingHorizontal: 28 }]}>
        <Header frame={frame} />
        {body}
        {i === pages.length - 1 ? <NotesBlock notes={frame.notes} /> : null}
        <Footer frame={frame} />
      </Page>
    ))}
  </Document>
);

// --- Ageing ----------------------------------------------------------------

export interface AgeingBucket {
  label: string;
  amount: number;
}

/** A strip of ageing buckets: amount and share of the total, with a bar. */
/** Ageing bucket inks, youngest to oldest: green, amber, rust, red. */
export const BUCKET_TONES = [C.success, C.amber, '#B4642B', C.danger, C.danger];

export const AgeingStrip = ({ buckets }: { buckets: AgeingBucket[] }) => {
  const total = buckets.reduce((a, b) => a + b.amount, 0) || 1;
  const tones = BUCKET_TONES;
  return (
    <View style={[s.kpiRow, { marginTop: 10 }]}>
      {buckets.map((b, i) => (
        <View key={b.label} style={s.kpi}>
          <Text style={s.kpiLabel}>{b.label.toUpperCase()}</Text>
          <Text style={[s.kpiVal, { fontSize: 11 }]}>{rs0(b.amount)}</Text>
          <View style={{ height: 3, backgroundColor: C.line, borderRadius: 2, marginTop: 5 }}>
            <View
              style={{
                height: 3,
                width: `${Math.max(2, (b.amount / total) * 100)}%`,
                backgroundColor: tones[i] ?? C.muted,
                borderRadius: 2,
              }}
            />
          </View>
          <Text style={{ fontSize: 6.5, color: C.muted, marginTop: 3 }}>
            {pct((b.amount / total) * 100)} of balance
          </Text>
        </View>
      ))}
    </View>
  );
};

// --- Helpers for building rows ----------------------------------------------

export const sum = <T,>(xs: T[], f: (x: T) => number) =>
  Math.round(xs.reduce((a, x) => a + f(x), 0) * 100) / 100;

/** Two side-by-side blocks (a small table next to KPIs, two summaries). */
export const Columns = ({ children, gap = 14 }: { children: React.ReactNode; gap?: number }) => (
  <View style={{ flexDirection: 'row', gap }}>{children}</View>
);
export const Column = ({ children, flex = 1 }: { children: React.ReactNode; flex?: number }) => (
  <View style={{ flex }}>{children}</View>
);

import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { C, s, TableView, LetterheadBand } from './shiftSummaryDoc.js';
import { DSR_FULL_NAME, DSR_LABEL } from '@pump/shared';
import type { TableColumn, TotalRow } from '../../pump-ds/table/columns.js';
import { totalTexts } from '../../pump-ds/table/columns.js';
import { formatBusinessDate, formatDateTime } from '../../utils/format.js';
import {
  readDssrDay,
  type DssrDay,
  type DssrRow,
} from '../../components/reports/dssr/dssrModel.js';
import {
  ATTENDANT_COLUMNS,
  DSSR_COGS_NOTE,
  DSSR_EMPTY,
  DSSR_TITLES,
  FUEL_PRODUCT_COLUMNS,
  FUEL_STOCK_COLUMNS,
  MERCHANDISE_STOCK_COLUMNS,
  NOZZLE_COLUMNS,
  SHIFT_COLUMNS,
  attendantTotalRow,
  dssrCellTone,
  dssrTiles,
  fuelTotalRow,
  fuelUnitsNote,
  shiftTotalRow,
} from '../../components/reports/dssr/dssrColumns.js';
import { pdfTable } from './pdfTable.js';
import type { DssrSection, DssrReportConfig } from './reportConfig.js';
import { DEFAULT_DSSR_CONFIG } from './reportConfig.js';

export type { DssrSection, DssrReportConfig } from './reportConfig.js';
export { DEFAULT_DSSR_CONFIG, DSSR_SECTION_LABELS } from './reportConfig.js';

/*
 * The PDF reads the DSR through `readDssrDay`, the screen's model, and prints
 * the screen's columns, total rows, titles and words (#580): the same volume
 * decimals, Short / Surplus / Balanced, and the mixed-unit total label. It
 * never recomputes a figure; every figure is the stored snapshot's.
 */

/** A variance figure or Status tints as the screen's: a shortage red, a surplus amber. */
const TONE = { short: C.danger, surplus: C.amber } as const;
const toneOf = <T,>(col: TableColumn<T>, row: T): string | undefined => {
  const tone = dssrCellTone(col, row);
  return tone ? TONE[tone] : undefined;
};

/** A section title, uppercase as the screen's section header shows it. */
const Title = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <>
    <Text style={s.h2}>{title.toUpperCase()}</Text>
    {subtitle && <Text style={[s.label, { marginTop: -3, marginBottom: 5 }]}>{subtitle}</Text>}
  </>
);

/**
 * One screen table, printed. With no rows it prints the screen's empty text in
 * its place, as the screen does; the total row shows only under rows.
 */
function Table<T>({
  columns,
  rows,
  totalRow,
  empty,
}: {
  columns: TableColumn<T>[];
  rows: T[];
  totalRow?: TotalRow;
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <View style={s.reconBox}>
        <Text style={{ fontSize: 8.5, color: C.muted, padding: 8, textAlign: 'center' }}>
          {empty}
        </Text>
      </View>
    );
  }
  const t = pdfTable(columns, rows, totalRow, toneOf);
  return <TableView columns={t.columns} rows={t.rows} total={t.total} />;
}

const FigureRow = ({ label, value }: { label: string; value: string }) => (
  <View style={s.reconRow}>
    <Text style={{ fontSize: 8.5, color: C.body }}>{label}</Text>
    <Text style={{ fontSize: 8.5, fontFamily: 'Geist Mono', color: C.ink, fontWeight: 700 }}>
      {value}
    </Text>
  </View>
);

const MetaCell = ({ label, value }: { label: string; value: string }) => (
  <View style={s.metaCell}>
    <Text style={s.label}>{label.toUpperCase()}</Text>
    <Text style={s.valMono}>{value}</Text>
  </View>
);

const builders: Record<DssrSection, (day: DssrDay, cfg: DssrReportConfig) => React.ReactNode> = {
  header: (day, cfg) => (
    <View key="header">
      <LetterheadBand
        title={DSR_FULL_NAME.toUpperCase()}
        stationName={cfg.stationName}
        letterhead={cfg.letterhead}
        showLogo={cfg.showLogo}
      />
      <Text style={s.sub}>
        {formatBusinessDate(day.businessDate)}
        {day.generatedAt ? ` \u00b7 Generated ${formatDateTime(day.generatedAt)}` : ''}
      </Text>
    </View>
  ),
  // The day's fuel figures: the fuel table's own total row, so a mixed-unit
  // day prints `—` for its volumes here too, and says why.
  meta: (day) => {
    const cells = totalTexts(FUEL_PRODUCT_COLUMNS, day.fuel.rows, fuelTotalRow(day.fuel))?.cells;
    const total = (id: string) => cells?.[FUEL_PRODUCT_COLUMNS.findIndex((c) => c.id === id)] ?? '';
    const note = fuelUnitsNote(day.fuel);
    return (
      <View key="meta">
        <View style={s.metaBox}>
          <MetaCell label="Net fuel volume" value={total('net')} />
          <MetaCell label="Gross volume" value={total('gross')} />
          <MetaCell label="Testing volume" value={total('testing')} />
          <MetaCell label="Fuel sales" value={total('salesValue')} />
        </View>
        {note && <Text style={[s.label, { marginTop: 4 }]}>Totals: {note}.</Text>}
      </View>
    );
  },
  kpis: (day) => (
    <View key="kpis">
      <View style={s.kpiRow}>
        {dssrTiles(day).map((tile) => (
          <View key={tile.label} style={s.kpi}>
            <Text style={s.kpiLabel}>{tile.label.toUpperCase()}</Text>
            <Text style={s.kpiVal}>{tile.value}</Text>
            <Text style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>{tile.hint}</Text>
          </View>
        ))}
      </View>
      <Text style={[s.label, { marginTop: 4 }]}>{DSSR_COGS_NOTE}</Text>
    </View>
  ),
  financial: (day) => (
    <View key="financial">
      <Title title={DSSR_TITLES.sales} />
      <View style={s.reconBox}>
        {day.sales.map((line) => (
          <FigureRow key={line.label} label={line.label} value={line.value} />
        ))}
      </View>
      <Text style={[s.label, { marginTop: 4 }]}>
        Sales only. Collections, expenses, income and supplier payments are in the Daily cash book.
      </Text>
    </View>
  ),
  // Fuel, nozzles and shifts always print, empty or not, as on screen; the
  // stock and attendant sections only when the day has them.
  fuelByProduct: (day) => (
    <View key="fuelByProduct">
      <Title title={DSSR_TITLES.fuel} />
      <Table
        columns={FUEL_PRODUCT_COLUMNS}
        rows={day.fuel.rows}
        totalRow={fuelTotalRow(day.fuel)}
        empty={DSSR_EMPTY.fuel}
      />
    </View>
  ),
  nozzles: (day) => (
    <View key="nozzles">
      <Title title={DSSR_TITLES.nozzles} subtitle={DSSR_TITLES.nozzlesSubtitle} />
      <Table columns={NOZZLE_COLUMNS} rows={day.nozzles} empty={DSSR_EMPTY.nozzles} />
    </View>
  ),
  fuelStockVariance: (day) =>
    day.fuelStock.length === 0 ? null : (
      <View key="fuelStockVariance">
        <Title title={DSSR_TITLES.fuelStock} />
        <Table columns={FUEL_STOCK_COLUMNS} rows={day.fuelStock} empty="" />
      </View>
    ),
  merchandiseStockVariance: (day) =>
    day.merchandiseStock.length === 0 ? null : (
      <View key="merchandiseStockVariance">
        <Title title={DSSR_TITLES.merchandiseStock} />
        <Table columns={MERCHANDISE_STOCK_COLUMNS} rows={day.merchandiseStock} empty="" />
      </View>
    ),
  shifts: (day) => (
    <View key="shifts">
      <Title title={DSSR_TITLES.shifts} />
      <Table
        columns={SHIFT_COLUMNS}
        rows={day.shifts}
        totalRow={shiftTotalRow(day)}
        empty={DSSR_EMPTY.shifts}
      />
      {/* Attendant (Handover) variance per Attendant/DU across the day (#287). */}
      {day.attendants.length > 0 && (
        <>
          <Title title={DSSR_TITLES.attendants} subtitle={DSSR_TITLES.attendantsSubtitle} />
          <Table
            columns={ATTENDANT_COLUMNS}
            rows={day.attendants}
            totalRow={attendantTotalRow(day)}
            empty=""
          />
        </>
      )}
    </View>
  ),
};

/**
 * Marking carried by a DSSR printed from a Business Day that is not closed yet
 * (a live preview, not the sealed snapshot). It is outside the configurable
 * sections so no station layout can print a draft without it.
 */
export const DSSR_DRAFT_MARK = 'DRAFT \u2014 DAY NOT CLOSED';

const DraftBanner = () => (
  <View
    key="draft"
    style={{
      borderWidth: 1,
      borderColor: C.amber,
      backgroundColor: C.warnBg,
      paddingVertical: 5,
      paddingHorizontal: 8,
      marginBottom: 8,
    }}
  >
    <Text style={{ fontSize: 9, fontWeight: 700, color: C.warnFg }}>{DSSR_DRAFT_MARK}</Text>
    <Text style={{ fontSize: 7.5, color: C.warnFg, marginTop: 2 }}>
      Figures can still change until the Business Day is closed and the {DSR_LABEL} is sealed.
    </Text>
  </View>
);

/**
 * Daily Station Sales Report (DSR; internal name `dssr`) as a branded, mono-numeric react-pdf
 * document. Reuses the shift-summary primitive kit (fonts, table, KPIs) so both
 * reports stay visually identical. Reads the immutable DSSR snapshot through
 * the screen's model (`readDssrDay`), so it prints what the screen shows.
 */
export const DssrDoc: React.FC<{
  dssr: (DssrRow & { draft?: boolean }) | null | undefined;
  config?: DssrReportConfig;
}> = ({ dssr, config = DEFAULT_DSSR_CONFIG }) => {
  const day = readDssrDay(dssr ?? {});
  const draft = dssr?.draft === true;
  return (
    <Document>
      <Page size={config.paper} style={s.page}>
        {draft && <DraftBanner />}
        {config.sections.map((key) => builders[key]?.(day, config))}
        <View style={s.foot} fixed>
          <Text>
            Generated {new Date().toLocaleString('en-IN')}
            {draft ? ` \u2022 ${DSSR_DRAFT_MARK}` : ''}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};

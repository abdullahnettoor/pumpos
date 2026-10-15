import React from 'react';
import { Text, View } from '@react-pdf/renderer';
import type { TableColumn, TotalRow } from '../../pump-ds/table/columns.js';
import { C, s, TableView } from './shiftSummaryDoc.js';
import { pdfTable } from './pdfTable.js';

/*
 * The pieces a report PDF prints a screen with (#580, #595): a section title,
 * and a screen table (its `TableColumn` definitions, rows and total row) with
 * the note under it. Shared by the DSR and the Shift Summary PDFs.
 */

/**
 * A section title, uppercase as the screen's section header shows it, with
 * its subtitle. It never ends a page: it moves to the next page
 * with the start of what it titles.
 */
export const PdfTitle = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <View wrap={false} minPresenceAhead={50}>
    <Text style={s.h2}>{title.toUpperCase()}</Text>
    {subtitle && <Text style={[s.label, { marginTop: -3, marginBottom: 5 }]}>{subtitle}</Text>}
  </View>
);

/** A muted line under a table or a figure block: a total note, a caption. */
export const PdfNote = ({ children }: { children: string }) => (
  <Text style={[s.label, { marginTop: 4 }]}>{children}</Text>
);

/**
 * One screen table, printed. With no rows it prints the screen's empty text in
 * its place, as the screen does; the total row shows only under rows. `note`
 * (`Total: …`) says why a total is `—` or blank, full width under the table.
 */
export function PdfScreenTable<T>({
  columns,
  rows,
  totalRow,
  note,
  empty,
  tone,
  totalTone,
  flex,
}: {
  columns: TableColumn<T>[];
  rows: T[];
  totalRow?: TotalRow;
  note?: string | null;
  empty: string;
  /** The ink of a cell that marks a problem (a shortage red, a surplus amber). */
  tone?: (col: TableColumn<T>, row: T) => string | undefined;
  /** The same for a total cell (a variance total that is short). */
  totalTone?: (col: TableColumn<T>) => string | undefined;
  /** A column's share of the page width by column id, where an equal share wraps. */
  flex?: Partial<Record<string, number>>;
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
  const t = pdfTable(columns, rows, totalRow, tone);
  const cols = t.columns.map((c, i) => ({
    ...c,
    flex: flex?.[columns[i].id] ?? c.flex,
    fixed: true,
  }));
  const total = t.total?.map((cell, i) => {
    const ink = totalTone?.(columns[i]);
    return ink ? { ...cell, color: ink } : cell;
  });
  return (
    <>
      <TableView columns={cols} rows={t.rows} total={total} spanLabel keepHeader />
      {note && <PdfNote>{note}</PdfNote>}
    </>
  );
}

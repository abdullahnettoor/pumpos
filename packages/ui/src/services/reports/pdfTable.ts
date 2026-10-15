import {
  cellText,
  totalTexts,
  type TableColumn,
  type TotalRow,
} from '../../pump-ds/table/columns.js';
import type { Cell, Col } from './shiftSummaryDoc.js';

/** What a PDF `TableView` takes: its columns, rows and total row. */
export interface PdfTable {
  columns: Col[];
  rows: Cell[][];
  total?: Cell[];
}

/** A column's share of the row: its `width` when set, else an equal share. */
const flexOf = <T>(col: TableColumn<T>, count: number): number =>
  col.width ? (parseFloat(col.width) / 100) * count : 1;

/**
 * A screen table (`TableColumn` definitions, rows and total row) as a PDF
 * table: the same headers, cell text and total figures the screen prints,
 * from the same definitions. Headers print uppercase, as the screen shows
 * them. `color` tints a cell (a variance); the rest print in the body ink.
 */
export function pdfTable<T>(
  columns: TableColumn<T>[],
  rows: T[],
  totalRow?: TotalRow,
  color?: (col: TableColumn<T>, row: T) => string | undefined,
): PdfTable {
  const numeric = (col: TableColumn<T>) => col.kind === 'money' || col.kind === 'qty';
  const total = totalTexts(columns, rows, totalRow);
  return {
    columns: columns.map((col) => ({
      header: col.header.toUpperCase(),
      flex: flexOf(col, columns.length),
      ...(numeric(col) && { align: 'right' as const, mono: true }),
      ...(col.emphasis && { strong: true }),
    })),
    rows: rows.map((row) =>
      columns.map((col) => {
        const tone = color?.(col, row);
        return { text: cellText(col, row), ...(tone && { color: tone }) };
      }),
    ),
    ...(total && { total: total.cells.map((text) => ({ text })) }),
  };
}

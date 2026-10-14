import React, { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable, type DataTableProps } from '../../components/primitives/DataTable.js';
import {
  columnClass,
  headerClass,
  renderCell,
  sortValue,
  totalCells,
  type TableColumn,
  type TotalRow,
} from './columns.js';

export interface InteractiveTableProps<T> extends Omit<
  DataTableProps<T>,
  'columns' | 'data' | 'getRowId' | 'initialSorting'
> {
  columns: TableColumn<T>[];
  /** `undefined` while the query has no data yet. */
  rows: T[] | undefined;
  rowKey: (row: T, index: number) => string;
  /** A closing row; see `TotalRow`. */
  totalRow?: TotalRow;
}

function toColumnDefs<T>(
  columns: TableColumn<T>[],
  totals: React.ReactNode[] | null,
): ColumnDef<T, unknown>[] {
  return columns.map((col, i) => ({
    id: col.id,
    header: col.header,
    accessorFn: (row: T) => sortValue(col, row),
    cell: ({ row }) => renderCell(col, row.original, 'interactive'),
    footer: totals ? () => totals[i] : undefined,
    sortDescFirst: false,
    sortUndefined: 'last',
    meta: {
      className: columnClass(col),
      headerClassName: headerClass(col),
      width: col.width,
    },
  }));
}

/**
 * InteractiveTable — the working table of a screen: sortable headers, row
 * click to open a drawer, loading / error / empty from the Data Section. It
 * takes the same `TableColumn` definitions as `StatementTable`, so a list and
 * its printed statement cannot disagree on how a figure reads.
 */
export function InteractiveTable<T>({
  columns,
  rows,
  rowKey,
  totalRow,
  ...rest
}: InteractiveTableProps<T>) {
  // Callers memoise `columns` and `rows`; the defs follow them, not every render.
  const columnDefs = useMemo(() => {
    const totals = rows && rows.length > 0 ? totalCells(columns, rows, totalRow) : null;
    return toColumnDefs(columns, totals);
  }, [columns, rows, totalRow]);
  return <DataTable<T> {...rest} columns={columnDefs} data={rows} getRowId={rowKey} />;
}

import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../primitives/DataTable.js';
import { inr } from '../../utils/format.js';

/** One Attendant's Drawer, as reconciled by the server (ADR 0005, #278). */
export interface DrawerRow {
  attendantId: string;
  attendantName: string | null;
  duId?: string;
  duName: string | null;
  openingFloat: number;
  /** Null until the Attendant hands over. */
  cashSales: number | null;
  cashDrops: number;
  expectedCash: number | null;
  cashHandedOver: number | null;
  variance: number | null;
}

const money = (v: number | null) => (v == null ? '—' : inr(v));

const columns: ColumnDef<DrawerRow, any>[] = [
  {
    id: 'attendant',
    header: 'Attendant',
    accessorFn: (d) => d.attendantName ?? 'Attendant',
    cell: ({ row }) => (
      <span>
        {row.original.attendantName ?? 'Attendant'}
        {row.original.duName && (
          <span style={{ color: 'var(--text-muted)' }}> · {row.original.duName}</span>
        )}
      </span>
    ),
  },
  { id: 'float', header: 'Float', accessorKey: 'openingFloat', cell: (c) => money(c.getValue()) },
  { id: 'sales', header: 'Cash sales', accessorKey: 'cashSales', cell: (c) => money(c.getValue()) },
  { id: 'drops', header: 'Drops', accessorKey: 'cashDrops', cell: (c) => money(c.getValue()) },
  {
    id: 'expected',
    header: 'Expected',
    accessorKey: 'expectedCash',
    cell: (c) => money(c.getValue()),
  },
  {
    id: 'handed',
    header: 'Handed over',
    accessorKey: 'cashHandedOver',
    cell: (c) => money(c.getValue()),
  },
  {
    id: 'variance',
    header: 'Variance',
    accessorKey: 'variance',
    cell: (c) => {
      const v = c.getValue() as number | null;
      if (v == null) return <span style={{ color: 'var(--text-muted)' }}>Not handed over</span>;
      const color = v === 0 ? undefined : v < 0 ? 'var(--brand-danger)' : 'var(--state-success-fg)';
      return <span style={{ color }}>{inr(v)}</span>;
    },
  },
];

/**
 * Per-Drawer reconciliation: Opening Float + DU cash sales − Cash Drops,
 * against the cash handed over. The Shift's figure is the sum of these rows.
 * Display only; every figure comes from the server.
 */
export const DrawerReconciliationTable: React.FC<{ drawers: DrawerRow[] }> = ({ drawers }) => (
  <DataTable
    bare
    columns={columns}
    data={drawers}
    getRowId={(d, i) => `${d.attendantId}:${d.duId ?? d.duName ?? i}`}
    emptyMessage="No attendant Drawers on this shift."
  />
);

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
  /** Drops at close naming this Drawer (#287). */
  closeCashDrops?: number;
  expectedCash: number | null;
  cashHandedOver: number | null;
  variance: number | null;
}

const money = (v: number | null) => (v == null ? '—' : inr(v));
const num: React.CSSProperties = { fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' };

/** Signed variance with a surplus/short label (#306). */
const VarianceFigure: React.FC<{ value: number }> = ({ value }) => {
  const balanced = Math.abs(value) < 0.005;
  const color = balanced
    ? 'var(--text-muted)'
    : value < 0
      ? 'var(--brand-danger)'
      : 'var(--state-success-fg)';
  return (
    <span style={{ ...num, color }}>
      {value > 0 ? '+' : ''}
      {inr(value)}
      {balanced ? '' : value > 0 ? ' surplus' : ' short'}
    </span>
  );
};

const buildColumns = (totalVariance?: number): ColumnDef<DrawerRow, any>[] => {
  const withTotals = totalVariance !== undefined;
  return [
    {
      id: 'attendant',
      header: 'Attendant',
      accessorFn: (d) => d.attendantName ?? 'Attendant',
      cell: ({ row }) => (
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ color: 'var(--text-strong)' }}>
            {row.original.attendantName ?? 'Attendant'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {row.original.duName ?? ''}
            {row.original.cashHandedOver === null && (
              <span
                className="badge badge-warning"
                style={{ marginLeft: row.original.duName ? 6 : 0 }}
              >
                Not handed over
              </span>
            )}
          </div>
        </div>
      ),
      footer: withTotals ? () => 'Total' : undefined,
    },
    {
      id: 'float',
      header: 'Float',
      accessorKey: 'openingFloat',
      cell: (c) => <span style={num}>{money(c.getValue())}</span>,
    },
    {
      id: 'sales',
      header: 'Cash sales',
      accessorKey: 'cashSales',
      cell: (c) => <span style={num}>{money(c.getValue())}</span>,
    },
    {
      id: 'drops',
      header: 'Drops',
      accessorFn: (r) => Number(r.cashDrops ?? 0) + Number(r.closeCashDrops ?? 0),
      cell: (c) => <span style={num}>{money(c.getValue())}</span>,
    },
    {
      id: 'expected',
      header: 'Expected',
      accessorKey: 'expectedCash',
      cell: (c) => <span style={num}>{money(c.getValue())}</span>,
    },
    {
      id: 'handed',
      header: 'Handed over',
      accessorKey: 'cashHandedOver',
      cell: (c) => <span style={num}>{money(c.getValue())}</span>,
    },
    {
      id: 'variance',
      header: 'Variance',
      accessorKey: 'variance',
      cell: (c) => {
        const v = c.getValue() as number | null;
        return v == null ? (
          <span style={{ color: 'var(--text-muted)' }}>—</span>
        ) : (
          <VarianceFigure value={v} />
        );
      },
      footer: withTotals ? () => <VarianceFigure value={totalVariance} /> : undefined,
    },
  ];
};

/**
 * Per-Drawer reconciliation: Opening Float + DU cash sales − Cash Drops,
 * against the cash handed over. The Shift's figure is the sum of these rows.
 * Display only; every figure comes from the server.
 */
export const DrawerReconciliationTable: React.FC<{
  drawers: DrawerRow[];
  /** Σ attendant variance; shows a totals row when given (#306). */
  totalVariance?: number;
}> = ({ drawers, totalVariance }) => (
  <DataTable
    bare
    dense
    columns={buildColumns(totalVariance)}
    data={drawers}
    getRowId={(d, i) => `${d.attendantId}:${d.duId ?? d.duName ?? i}`}
    emptyMessage="No attendant Drawers on this shift."
  />
);

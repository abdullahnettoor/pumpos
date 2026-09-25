import React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../primitives/DataTable.js';
import { formatMoney } from '../../utils/format.js';
import { isBalancedVariance } from '@pump/shared';

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

// Cells drop the ₹ symbol and use tabular sans figures so all seven columns
// fit the close wizard without sideways scroll (#306); the table caption
// states the currency.
const money = (v: number | null) => (v == null ? '—' : formatMoney(v, { symbol: false }));
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const Num: React.FC<{ v: number | null }> = ({ v }) => <span style={num}>{money(v)}</span>;

const varianceWord = (v: number) =>
  isBalancedVariance(v) ? 'balanced' : v > 0 ? 'surplus' : 'short';

/** Signed variance, coloured by sign (#306). `label` adds surplus/short. */
export const VarianceFigure: React.FC<{ value: number; label?: boolean }> = ({ value, label }) => {
  const balanced = isBalancedVariance(value);
  const color = balanced
    ? 'var(--text-muted)'
    : value < 0
      ? 'var(--brand-danger)'
      : 'var(--state-success-fg)';
  return (
    <span style={{ ...num, color }}>
      {value > 0 ? '+' : ''}
      {formatMoney(value, { symbol: false })}
      {label && ` ${varianceWord(value)}`}
    </span>
  );
};

/** Σ of a column, or null ("—") while any Drawer has not handed over: a
 *  partial total would read as the shift's figure. */
const sumAll = (rows: DrawerRow[], pick: (r: DrawerRow) => number | null): number | null => {
  let total = 0;
  for (const r of rows) {
    const v = pick(r);
    if (v == null) return null;
    total += v;
  }
  return Math.round(total * 100) / 100;
};

const drops = (r: DrawerRow) => Number(r.cashDrops ?? 0) + Number(r.closeCashDrops ?? 0);

const buildColumns = (
  rows: DrawerRow[],
  totals: boolean,
  totalVariance?: number,
): ColumnDef<DrawerRow, any>[] => {
  const pending = rows.some((r) => r.cashHandedOver === null);
  const foot = (pick: (r: DrawerRow) => number | null) =>
    totals ? () => <Num v={sumAll(rows, pick)} /> : undefined;
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
                title="Not handed over"
                style={{ marginLeft: row.original.duName ? 6 : 0 }}
              >
                Pending
              </span>
            )}
          </div>
        </div>
      ),
      footer: totals ? () => 'Total' : undefined,
    },
    {
      id: 'float',
      header: 'Float',
      accessorKey: 'openingFloat',
      cell: (c) => <Num v={c.getValue()} />,
      footer: foot((r) => Number(r.openingFloat ?? 0)),
    },
    {
      id: 'sales',
      header: 'Cash sales',
      accessorKey: 'cashSales',
      cell: (c) => <Num v={c.getValue()} />,
      footer: foot((r) => r.cashSales),
    },
    {
      id: 'drops',
      header: 'Drops',
      accessorFn: drops,
      cell: (c) => <Num v={c.getValue()} />,
      footer: foot(drops),
    },
    {
      id: 'expected',
      header: 'Expected',
      accessorKey: 'expectedCash',
      cell: (c) => <Num v={c.getValue()} />,
      footer: foot((r) => r.expectedCash),
    },
    {
      id: 'handed',
      header: 'Handed',
      accessorKey: 'cashHandedOver',
      cell: (c) => <Num v={c.getValue()} />,
      footer: foot((r) => r.cashHandedOver),
    },
    {
      id: 'variance',
      header: 'Variance',
      accessorKey: 'variance',
      cell: (c) => {
        const v = c.getValue() as number | null;
        return v == null ? <Num v={null} /> : <VarianceFigure value={v} />;
      },
      footer: totals
        ? () =>
            pending || totalVariance === undefined ? (
              <Num v={null} />
            ) : (
              <div style={{ lineHeight: 1.3 }}>
                <VarianceFigure value={totalVariance} />
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>
                  {varianceWord(totalVariance)}
                </div>
              </div>
            )
        : undefined,
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
  /** Show a totals row (#306). Figures read "—" until every Drawer hands over. */
  showTotals?: boolean;
  /** Σ attendant variance from the server, shown in the totals row. */
  totalVariance?: number;
}> = ({ drawers, showTotals = false, totalVariance }) => (
  <>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Amounts in ₹</div>
    <DataTable
      bare
      dense
      columns={buildColumns(drawers, showTotals, totalVariance)}
      data={drawers}
      getRowId={(d, i) => `${d.attendantId}:${d.duId ?? d.duName ?? i}`}
      emptyMessage="No attendant Drawers on this shift."
    />
  </>
);

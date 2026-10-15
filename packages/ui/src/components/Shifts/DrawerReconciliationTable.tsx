import React, { useMemo } from 'react';
import {
  Button,
  InteractiveTable,
  StatusChip,
  VarianceChip,
  type TableColumn,
  type TotalRow,
} from '../../pump-ds/index.js';
import { formatMoney } from '../../utils/format.js';
import { formatVariance } from '../../utils/variance.js';
import {
  closeDrawerRows,
  closeDrawerTotal,
  type CloseDrawerRow,
  type CloseDrawerTotal,
} from './closeShiftModel.js';
import type { StaffAssignmentInput } from './liveShiftModel.js';

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

type Figure = keyof CloseDrawerTotal['values'];

const money = (id: Figure, header: string): TableColumn<CloseDrawerRow> => ({
  id,
  header,
  kind: 'money',
  value: (r) => r[id],
  cell: (r) => (r[id] == null ? '—' : formatMoney(r[id])),
});

/**
 * The Drawers table's columns (#534), on the Table module: mono figures, the
 * handover status from the vocabulary, the variance as a `VarianceChip`.
 * With `onOpenHandover` the status cell carries Record / View (the close page).
 */
export function drawerColumns(
  onOpenHandover?: (assignment: StaffAssignmentInput) => void,
): TableColumn<CloseDrawerRow>[] {
  return [
    {
      id: 'drawer',
      header: 'Drawer',
      kind: 'text',
      value: (r) => r.label,
      emphasis: true,
      width: '19%',
    },
    {
      id: 'status',
      header: 'Handover',
      kind: 'status',
      value: (r) => (r.pending ? 'handover-pending' : 'handover-recorded'),
      sortable: false,
      width: onOpenHandover ? '22%' : '14%',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <StatusChip
            status={r.pending ? 'handover-pending' : 'handover-recorded'}
            size="md"
            showIcon={!r.pending}
          />
          {onOpenHandover && r.assignment && (
            <Button
              variant={r.pending ? 'secondary' : 'ghost'}
              size="xs"
              onClick={() => onOpenHandover(r.assignment!)}
            >
              {r.pending ? 'Record' : 'View'}
              <span className="sr-only"> {r.label} handover</span>
            </Button>
          )}
        </div>
      ),
    },
    money('openingFloat', 'Float'),
    money('cashSales', 'Cash sales'),
    money('drops', 'Drops'),
    money('expected', 'Expected'),
    money('declared', 'Declared'),
    {
      id: 'variance',
      header: 'Variance',
      kind: 'money',
      value: (r) => r.variance,
      cell: (r) => (r.variance == null ? '—' : <VarianceChip amount={r.variance} size="md" />),
      text: (r) => (r.variance == null ? '—' : formatVariance(r.variance, 'cash').text),
    },
  ];
}

/**
 * The total row: the handed-over Drawers, labelled with what it leaves out.
 * The variance total reads as the rows do, a `VarianceChip` with the one
 * balanced rule; the figure stays in `values` for a printed copy.
 */
export const drawerTotalRow = (rows: CloseDrawerRow[], total: CloseDrawerTotal): TotalRow => {
  const none = rows.length === 0 || rows.every((r) => r.pending);
  return {
    label: total.label,
    derive: false,
    values: { ...total.values, variance: none ? null : total.variance },
    cells: none ? undefined : { variance: <VarianceChip amount={total.variance} size="md" /> },
  };
};

/**
 * Per-Drawer reconciliation: Opening Float + DU cash sales − Cash Drops,
 * against the cash handed over (Shift summary, #535). Display only; every
 * figure comes from the server. `showTotals` adds the total row.
 */
export const DrawerReconciliationTable: React.FC<{
  drawers: DrawerRow[];
  showTotals?: boolean;
}> = ({ drawers, showTotals = false }) => {
  const rows = useMemo(
    () => closeDrawerRows({ drawers, assignments: [], handovers: [] }),
    [drawers],
  );
  const columns = useMemo(() => drawerColumns(), []);
  return (
    <div className="overflow-hidden rounded-card border border-border-soft bg-surface">
      <InteractiveTable
        bare
        dense
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
        emptyMessage="No attendant drawers on this shift."
        totalRow={showTotals ? drawerTotalRow(rows, closeDrawerTotal(rows)) : undefined}
      />
    </div>
  );
};

import React from 'react';
import { VarianceChip, type TableColumn, type TotalRow } from '../../pump-ds/index.js';
import { formatQuantity } from '../../utils/format.js';
import { formatVariance } from '../../utils/variance.js';
import type {
  ShiftSummary,
  SummaryCreditRow,
  SummaryFuelRow,
  SummaryHandoverRow,
  SummaryNozzleRow,
  SummaryTerminalRow,
  VolumeTotals,
} from './shiftSummaryModel.js';

/** The Shift Summary's section titles (#535). */
export const SHIFT_SUMMARY_TITLES = {
  nozzles: 'Nozzles',
  nozzlesSubtitle: 'Meter readings and volume sold',
  fuel: 'Fuel sales by product',
  handovers: 'Attendant handovers',
  terminals: 'Card and UPI by terminal',
  credit: 'Credit sales',
  cash: 'Cash reconciliation',
  drawers: 'Drawers',
  drawersSubtitle:
    "Each attendant's pouch: opening float + cash sales − cash drops, against the cash handed over",
  entry: 'Record a credit sale',
} as const;

const qty = <T,>(
  id: string,
  header: string,
  value: (r: T) => number,
  unit: (r: T) => string,
  decimals?: number,
): TableColumn<T> => ({ id, header, kind: 'qty', value, unit, decimals });

export const NOZZLE_COLUMNS: TableColumn<SummaryNozzleRow>[] = [
  { id: 'nozzle', header: 'Nozzle', kind: 'text', emphasis: true, value: (r) => r.nozzle },
  { id: 'product', header: 'Product', kind: 'text', value: (r) => r.product },
  // Meter readings carry 3 decimals and are not a quantity that adds up.
  {
    id: 'opening',
    header: 'Opening',
    kind: 'qty',
    decimals: 3,
    total: false,
    value: (r) => r.opening,
  },
  {
    id: 'closing',
    header: 'Closing',
    kind: 'qty',
    decimals: 3,
    total: false,
    value: (r) => r.closing,
  },
  qty(
    'gross',
    'Gross',
    (r) => r.gross,
    (r) => r.unit,
    3,
  ),
  qty(
    'testing',
    'Testing',
    (r) => r.testing,
    (r) => r.unit,
    3,
  ),
  qty(
    'net',
    'Net',
    (r) => r.net,
    (r) => r.unit,
    3,
  ),
];

/**
 * The stored volume totals. On a mixed-unit shift every volume reads `—`
 * (never added across L and kg); a total the snapshot lacks stays blank.
 */
const volumeValues = (v: VolumeTotals) =>
  v.units.length > 1
    ? { gross: null, testing: null, net: null }
    : {
        ...(v.gross != null && { gross: v.gross }),
        ...(v.testing != null && { testing: v.testing }),
        ...(v.net != null && { net: v.net }),
      };

const volumeUnits = (v: VolumeTotals) =>
  v.unit ? { gross: v.unit, testing: v.unit, net: v.unit } : undefined;

export function nozzleTotalRow(s: ShiftSummary): TotalRow {
  return { values: volumeValues(s.volumes), units: volumeUnits(s.volumes), derive: false };
}

export const FUEL_COLUMNS: TableColumn<SummaryFuelRow>[] = [
  { id: 'product', header: 'Product', kind: 'text', emphasis: true, value: (r) => r.product },
  qty(
    'gross',
    'Gross',
    (r) => r.gross,
    (r) => r.unit,
    3,
  ),
  qty(
    'testing',
    'Testing',
    (r) => r.testing,
    (r) => r.unit,
    3,
  ),
  qty(
    'net',
    'Net',
    (r) => r.net,
    (r) => r.unit,
    3,
  ),
  { id: 'salesValue', header: 'Sales value', kind: 'money', value: (r) => r.salesValue },
];

export function fuelTotalRow(s: ShiftSummary): TotalRow {
  return {
    values: {
      ...volumeValues(s.volumes),
      ...(s.fuelSalesValue != null && { salesValue: s.fuelSalesValue }),
    },
    units: volumeUnits(s.volumes),
    derive: false,
  };
}

const variance = <T,>(value: (r: T) => number): TableColumn<T> => ({
  id: 'variance',
  header: 'Variance',
  kind: 'money',
  value,
  text: (r) => formatVariance(value(r), 'cash').text,
  cell: (r) => <VarianceChip amount={value(r)} size="md" />,
});

export const HANDOVER_COLUMNS: TableColumn<SummaryHandoverRow>[] = [
  { id: 'attendant', header: 'Attendant', kind: 'text', emphasis: true, value: (r) => r.attendant },
  { id: 'du', header: 'Dispenser', kind: 'text', value: (r) => r.du },
  { id: 'cash', header: 'Cash', kind: 'money', value: (r) => r.cash },
  { id: 'cardUpi', header: 'Card / UPI', kind: 'money', value: (r) => r.cardUpi },
  { id: 'credit', header: 'Credit chits', kind: 'money', value: (r) => r.credit },
  { id: 'expected', header: 'Expected sales', kind: 'money', value: (r) => r.expected },
  variance((r) => r.variance),
];

export const TERMINAL_COLUMNS: TableColumn<SummaryTerminalRow>[] = [
  {
    id: 'terminal',
    header: 'Terminal',
    kind: 'text',
    emphasis: true,
    value: (r) => r.terminal,
    text: (r) => (r.provider ? `${r.terminal} · ${r.provider}` : r.terminal),
    cell: (r) => (
      <span className="flex flex-col">
        <span>{r.terminal}</span>
        {r.provider && <span className="text-[12px] font-normal text-ink-faint">{r.provider}</span>}
      </span>
    ),
  },
  {
    id: 'handledBy',
    header: 'Handled by',
    kind: 'text',
    value: (r) => r.handledBy.join(', '),
    cell: (r) =>
      r.handledBy.length === 0 ? (
        '—'
      ) : (
        <span className="flex flex-col gap-0.5">
          {r.handledBy.map((who) => (
            <span key={who}>{who}</span>
          ))}
        </span>
      ),
  },
  { id: 'card', header: 'Card', kind: 'money', value: (r) => r.card },
  { id: 'upi', header: 'UPI', kind: 'money', value: (r) => r.upi },
  { id: 'total', header: 'Total', kind: 'money', value: (r) => r.total },
];

export const CREDIT_COLUMNS: TableColumn<SummaryCreditRow>[] = [
  { id: 'customer', header: 'Customer', kind: 'text', emphasis: true, value: (r) => r.customer },
  { id: 'vehicle', header: 'Vehicle', kind: 'text', value: (r) => r.vehicle },
  { id: 'product', header: 'Product', kind: 'text', value: (r) => r.product },
  {
    id: 'quantity',
    header: 'Qty',
    kind: 'qty',
    total: false,
    value: (r) => r.quantity,
    unit: (r) => r.unit,
    text: (r) => (r.quantity == null ? '—' : formatQuantity(r.quantity, r.unit, { decimals: 3 })),
  },
  { id: 'notes', header: 'Notes', kind: 'text', value: (r) => r.notes },
  { id: 'amount', header: 'Amount', kind: 'money', value: (r) => r.amount },
];

/** The credit total as stored; blank (with a note) for a snapshot without one. */
export function creditTotalRow(s: ShiftSummary): TotalRow {
  return {
    values: s.creditTotal == null ? {} : { amount: s.creditTotal },
    derive: false,
  };
}

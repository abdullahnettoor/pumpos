import React from 'react';
import { formatStationDateTime } from '@pump/shared';
import { VarianceChip, type TableColumn, type TotalRow } from '../../pump-ds/index.js';
import { formatBusinessDate, formatMoney, formatQuantity } from '../../utils/format.js';
import { formatVariance } from '../../utils/variance.js';
import {
  legacyPurchases,
  type LegacySnapshotPurchase,
} from '../../services/reports/legacyPurchases.js';
import type {
  CashLine,
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
  page: 'Shift summary',
  warnings: 'Warnings at close',
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
  legacyPurchases: 'Supplier fuel intakes',
  entry: 'Record a credit sale',
} as const;

/** What the nozzle table says when the snapshot holds no readings. */
export const NOZZLES_EMPTY = 'No nozzle readings in this summary.';

/** The two signature lines a printed summary closes with. */
export const SIGNATURE_LINES = [
  'Operator / reconciliation staff signature',
  'Owner / manager verification signature',
] as const;

/** A volume in its unit's precision: 2 decimals for litres and kg (#594 review). */
const qty = <T,>(
  id: string,
  header: string,
  value: (r: T) => number,
  unit: (r: T) => string,
): TableColumn<T> => ({ id, header, kind: 'qty', value, unit });

export const NOZZLE_COLUMNS: TableColumn<SummaryNozzleRow>[] = [
  { id: 'nozzle', header: 'Nozzle', kind: 'text', emphasis: true, value: (r) => r.nozzle },
  { id: 'product', header: 'Product', kind: 'text', value: (r) => r.product },
  // Meter readings carry 3 decimals, in the nozzle's unit (a CNG meter reads kg),
  // and are not a quantity that adds up.
  {
    id: 'opening',
    header: 'Opening',
    kind: 'qty',
    decimals: 3,
    total: false,
    value: (r) => r.opening,
    unit: (r) => r.unit,
  },
  {
    id: 'closing',
    header: 'Closing',
    kind: 'qty',
    decimals: 3,
    total: false,
    value: (r) => r.closing,
    unit: (r) => r.unit,
  },
  qty(
    'gross',
    'Gross',
    (r) => r.gross,
    (r) => r.unit,
  ),
  qty(
    'testing',
    'Testing',
    (r) => r.testing,
    (r) => r.unit,
  ),
  qty(
    'net',
    'Net',
    (r) => r.net,
    (r) => r.unit,
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

/** A total row's label: what it covers ("Total of 3 nozzles"). */
export const totalLabel = (n: number, one: string, many: string): string =>
  `Total of ${n} ${n === 1 ? one : many}`;

export function nozzleTotalRow(s: ShiftSummary): TotalRow {
  return {
    label: totalLabel(s.nozzles.length, 'nozzle', 'nozzles'),
    values: volumeValues(s.volumes),
    units: volumeUnits(s.volumes),
    derive: false,
  };
}

export const FUEL_COLUMNS: TableColumn<SummaryFuelRow>[] = [
  { id: 'product', header: 'Product', kind: 'text', emphasis: true, value: (r) => r.product },
  qty(
    'gross',
    'Gross',
    (r) => r.gross,
    (r) => r.unit,
  ),
  qty(
    'testing',
    'Testing',
    (r) => r.testing,
    (r) => r.unit,
  ),
  qty(
    'net',
    'Net',
    (r) => r.net,
    (r) => r.unit,
  ),
  { id: 'salesValue', header: 'Sales value', kind: 'money', value: (r) => r.salesValue },
];

export function fuelTotalRow(s: ShiftSummary): TotalRow {
  return {
    label: totalLabel(s.fuel.length, 'product', 'products'),
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
    text: (r) => (r.quantity == null ? '—' : formatQuantity(r.quantity, r.unit)),
  },
  { id: 'notes', header: 'Notes', kind: 'text', value: (r) => r.notes },
  { id: 'amount', header: 'Amount', kind: 'money', value: (r) => r.amount },
];

/** The credit total as stored; blank (with a note) for a snapshot without one. */
export function creditTotalRow(s: ShiftSummary): TotalRow {
  return {
    label: totalLabel(s.credit.length, 'credit sale', 'credit sales'),
    values: s.creditTotal == null ? {} : { amount: s.creditTotal },
    derive: false,
  };
}

/**
 * Handover money is not stored as totals: the table adds the rows in paise.
 * The variance total reads as the rows do, a `VarianceChip` on screen and its
 * words on paper (Balanced, or the signed figure).
 */
export const handoverTotalRow = (s: ShiftSummary): TotalRow => ({
  label: totalLabel(s.handovers.length, 'handover', 'handovers'),
  values: { variance: s.handoverVariance },
  texts: { variance: formatVariance(s.handoverVariance, 'cash').text },
  cells: { variance: <VarianceChip amount={s.handoverVariance} size="md" /> },
});

/** Terminal money is not stored as totals: the table adds the rows in paise. */
export const terminalTotalRow = (s: ShiftSummary): TotalRow => ({
  label: totalLabel(s.terminals.length, 'terminal', 'terminals'),
});

/** The details row: business day, open and close times, who reconciled. */
export function summaryDetails(s: ShiftSummary, timeZone?: string): [string, string][] {
  const at = (iso: string | null) => (iso ? formatStationDateTime(iso, timeZone) : '—');
  return [
    ['Business day', s.businessDate ? formatBusinessDate(s.businessDate) : '—'],
    ['Opened', at(s.openedAt)],
    ['Closed', at(s.closedAt)],
    ['Reconciled by', s.closedBy],
  ];
}

/** The line under the details: when the snapshot was taken; null without a time. */
export function snapshotNote(s: ShiftSummary, timeZone?: string): string | null {
  return s.generatedAt
    ? `Snapshot taken at close, ${formatStationDateTime(s.generatedAt, timeZone)}. Its figures never change.`
    : null;
}

const SIGN: Record<CashLine['role'], string> = {
  base: '',
  plus: '+ ',
  minus: '− ',
  result: '',
  variance: '',
};

/** A cash reconciliation figure: `+ ₹…` added, `− ₹…` taken off, a variance in its words. */
export const cashLineText = (line: CashLine): string =>
  line.role === 'variance'
    ? formatVariance(line.amount, 'cash').text
    : `${SIGN[line.role]}${formatMoney(line.amount)}`;

/** A purchase an older snapshot stored (#308), keyed for a table. */
export type LegacyPurchaseRow = LegacySnapshotPurchase & { key: string };

export const legacyPurchaseRows = (snapshot: unknown): LegacyPurchaseRow[] =>
  legacyPurchases(snapshot).map((p, i) => ({ ...p, key: String(i) }));

export const LEGACY_PURCHASE_COLUMNS: TableColumn<LegacyPurchaseRow>[] = [
  {
    id: 'supplier',
    header: 'Supplier',
    kind: 'text',
    emphasis: true,
    value: (r) => r.supplierName,
  },
  {
    id: 'ref',
    header: 'Ref / invoice',
    kind: 'text',
    value: (r) =>
      [r.documentNumber, r.invoiceNumber && `(${r.invoiceNumber})`].filter(Boolean).join(' ') ||
      null,
  },
  { id: 'notes', header: 'Notes', kind: 'text', value: (r) => r.notes },
  { id: 'amount', header: 'Amount', kind: 'money', value: (r) => r.amount },
];

/** The stored purchases are not totalled in the snapshot: the table adds the rows in paise. */
export const legacyPurchaseTotalRow = (rows: LegacyPurchaseRow[]): TotalRow => ({
  label: `Total of ${rows.length} stored ${rows.length === 1 ? 'purchase' : 'purchases'}`,
});

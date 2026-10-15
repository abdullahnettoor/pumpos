import React from 'react';
import { variancePresentation, type VarianceKind } from '@pump/shared';
import type { TableColumn, TotalRow } from '../../../pump-ds/index.js';
import { formatDateTime, formatQuantity, signedMoneyParts } from '../../../utils/format.js';
import type {
  AttendantRow,
  DssrDay,
  FuelProductRow,
  NozzleRow,
  ShiftRow,
  StockVarianceRow,
} from './dssrModel.js';

/**
 * Red and amber mean a problem (#515 page rules): a shortage reads red, a
 * surplus amber, a balanced variance plain. The tone comes from the shared
 * variance vocabulary, so the figure and its Status chip always agree.
 */
const VARIANCE_TEXT: Record<string, string | undefined> = {
  short: 'text-danger-fg',
  surplus: 'text-warning-fg',
};

const VarianceFigure: React.FC<{ amount: number; kind: VarianceKind; children: string }> = ({
  amount,
  kind,
  children,
}) => <span className={VARIANCE_TEXT[variancePresentation(amount, kind).state]}>{children}</span>;

const SignedMoney: React.FC<{ amount: number }> = ({ amount }) => (
  <VarianceFigure amount={amount} kind="cash">
    {signedMoneyParts(amount, { plus: true }).text}
  </VarianceFigure>
);

const SignedQty: React.FC<{ amount: number; unit: string }> = ({ amount, unit }) => (
  <VarianceFigure amount={amount} kind="stock">
    {formatQuantity(amount, unit, { plus: true })}
  </VarianceFigure>
);

export const FUEL_PRODUCT_COLUMNS: TableColumn<FuelProductRow>[] = [
  { id: 'product', header: 'Product', kind: 'text', emphasis: true, value: (r) => r.product },
  { id: 'gross', header: 'Gross', kind: 'qty', unit: (r) => r.unit, value: (r) => r.gross },
  { id: 'testing', header: 'Testing', kind: 'qty', unit: (r) => r.unit, value: (r) => r.testing },
  { id: 'net', header: 'Net', kind: 'qty', unit: (r) => r.unit, value: (r) => r.net },
  { id: 'salesValue', header: 'Sales value', kind: 'money', value: (r) => r.salesValue },
];

/**
 * The fuel total row carries the snapshot's own totals. Volumes are never
 * added across units (L and kg), so on a mixed day the label says so and the
 * volume cells read `—`.
 */
export function fuelTotalRow(fuel: DssrDay['fuel']): TotalRow {
  return {
    label:
      fuel.units.length > 1
        ? `Total (volumes not added across ${fuel.units.join(' and ')})`
        : 'Total',
    values: {
      gross: fuel.totals.gross,
      testing: fuel.totals.testing,
      net: fuel.totals.net,
      salesValue: fuel.totals.salesValue,
    },
  };
}

export const NOZZLE_COLUMNS: TableColumn<NozzleRow>[] = [
  { id: 'nozzle', header: 'Nozzle', kind: 'text', emphasis: true, value: (r) => r.nozzle },
  { id: 'product', header: 'Product', kind: 'text', value: (r) => r.product },
  { id: 'gross', header: 'Gross', kind: 'qty', unit: (r) => r.unit, value: (r) => r.gross },
  { id: 'testing', header: 'Testing', kind: 'qty', unit: (r) => r.unit, value: (r) => r.testing },
  { id: 'net', header: 'Net', kind: 'qty', unit: (r) => r.unit, value: (r) => r.net },
];

const stockQty = (id: 'book' | 'actual', header: string): TableColumn<StockVarianceRow> => ({
  id,
  header,
  kind: 'qty',
  unit: (r) => r.unit,
  value: (r) => r[id],
});

const STOCK_VARIANCE: TableColumn<StockVarianceRow> = {
  id: 'variance',
  header: 'Variance',
  kind: 'qty',
  unit: (r) => r.unit,
  value: (r) => r.variance,
  cell: (r) => <SignedQty amount={r.variance} unit={r.unit} />,
};

const STOCK_STATUS: TableColumn<StockVarianceRow> = {
  id: 'status',
  header: 'Status',
  kind: 'status',
  value: (r) => r.status,
  width: '14%',
};

export const FUEL_STOCK_COLUMNS: TableColumn<StockVarianceRow>[] = [
  { id: 'name', header: 'Tank', kind: 'text', emphasis: true, value: (r) => r.name },
  { id: 'product', header: 'Product', kind: 'text', value: (r) => r.product },
  stockQty('book', 'Book'),
  stockQty('actual', 'Dip'),
  STOCK_VARIANCE,
  STOCK_STATUS,
];

export const MERCHANDISE_STOCK_COLUMNS: TableColumn<StockVarianceRow>[] = [
  { id: 'name', header: 'Product', kind: 'text', emphasis: true, value: (r) => r.name },
  stockQty('book', 'Book'),
  stockQty('actual', 'Counted'),
  STOCK_VARIANCE,
  STOCK_STATUS,
];

export const SHIFT_COLUMNS: TableColumn<ShiftRow>[] = [
  { id: 'label', header: 'Shift', kind: 'text', emphasis: true, value: (r) => r.label },
  { id: 'template', header: 'Template', kind: 'text', value: (r) => r.template },
  {
    id: 'closedAt',
    header: 'Closed at',
    kind: 'date',
    value: (r) => r.closedAt,
    cell: (r) => formatDateTime(r.closedAt),
  },
  { id: 'netVolume', header: 'Net volume', kind: 'qty', unit: 'L', value: (r) => r.netVolume },
  {
    id: 'attendantVariance',
    header: 'Attendant var.',
    kind: 'money',
    value: (r) => r.attendantVariance,
    // Null for shifts closed before #287: their office variance already includes it.
    cell: (r) => (r.attendantVariance == null ? '—' : <SignedMoney amount={r.attendantVariance} />),
  },
  {
    id: 'officeVariance',
    header: 'Office count var.',
    kind: 'money',
    value: (r) => r.officeVariance,
    cell: (r) => <SignedMoney amount={r.officeVariance} />,
  },
];

/**
 * The day's variance totals, as stored with the snapshot. A shift closed
 * before two-level variance has no attendant figure, so the label says the
 * total leaves it out.
 */
export function shiftTotalRow(day: DssrDay): TotalRow {
  const withoutAttendant = day.shifts.filter((s) => s.attendantVariance == null).length;
  return {
    label:
      withoutAttendant > 0
        ? `Total (attendant var. excl. ${withoutAttendant} older ${withoutAttendant === 1 ? 'shift' : 'shifts'})`
        : 'Total',
    values: {
      ...(day.drawerTotals.attendantVariance != null && {
        attendantVariance: day.drawerTotals.attendantVariance,
      }),
      ...(day.drawerTotals.officeVariance != null && {
        officeVariance: day.drawerTotals.officeVariance,
      }),
    },
  };
}

export const ATTENDANT_COLUMNS: TableColumn<AttendantRow>[] = [
  { id: 'attendant', header: 'Attendant · DU', kind: 'text', value: (r) => r.attendant },
  {
    id: 'variance',
    header: 'Variance',
    kind: 'money',
    value: (r) => r.variance,
    cell: (r) => <SignedMoney amount={r.variance} />,
    width: '22%',
  },
];

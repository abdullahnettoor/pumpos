import React from 'react';
import { DSR_LABEL, variancePresentation, type VarianceKind } from '@pump/shared';
import type { TableColumn, TotalRow } from '../../../pump-ds/index.js';
import {
  formatDateTime,
  formatMoney,
  formatQuantity,
  signedMoneyParts,
} from '../../../utils/format.js';
import type {
  AttendantRow,
  DssrDay,
  FuelProductRow,
  NozzleRow,
  ShiftRow,
  StockVarianceRow,
} from './dssrModel.js';

/**
 * The DSR's columns, total rows and words, read by both the screen
 * (`DailyDssrView`) and the PDF (`dssrDoc`), so the two print the same rows,
 * words and totals (#580). Every column that renders its own `cell` also sets
 * `text`, which is what the PDF prints.
 */

/** The DSR's section titles, on screen and in the PDF. */
export const DSSR_TITLES = {
  sales: 'Sales summary',
  fuel: 'Fuel sales by product',
  nozzles: 'Nozzles',
  nozzlesSubtitle: "Volume by nozzle, across the day's shifts",
  fuelStock: 'Tank dip and fuel stock variance',
  merchandiseStock: 'Merchandise stock variance',
  shifts: 'Included shifts',
  attendants: 'Attendant variance',
  attendantsSubtitle: 'At handover, per attendant and DU',
} as const;

/** What an empty table on the DSR says, on screen and in the PDF. */
export const DSSR_EMPTY = {
  fuel: `No fuel sales in the ${DSR_LABEL}.`,
  nozzles: `No nozzle data in the ${DSR_LABEL}.`,
  shifts: 'No shifts were included for this day.',
} as const;

/** Under the margin tiles. */
export const DSSR_COGS_NOTE =
  "Cost of goods sold uses each product's weighted-average cost at day close. Fuel VAT is output tax (excluded from cost); merchandise cost is pre-tax.";

export interface DssrTile {
  label: string;
  value: string;
  hint: string;
}

/** The margin statement as tiles: every figure once, none repeating a table total. */
export function dssrTiles(day: DssrDay): DssrTile[] {
  const { margin } = day;
  return [
    { label: 'Shifts included', value: String(day.shiftsIncluded), hint: 'closed shifts' },
    {
      label: 'Total revenue',
      value: formatMoney(margin.revenue),
      hint: `Fuel ${formatMoney(margin.revenueFuel)} · Merchandise ${formatMoney(margin.revenueMerch)}`,
    },
    {
      label: 'Cost of goods sold',
      value: formatMoney(margin.cogs),
      hint: `Fuel ${formatMoney(margin.cogsFuel)} · Merchandise ${formatMoney(margin.cogsMerch)}`,
    },
    {
      label: 'Gross margin',
      value: formatMoney(margin.grossMargin),
      hint: 'Revenue − cost of goods sold',
    },
  ];
}

/**
 * Red and amber mean a problem (#515 page rules): a shortage reads red, a
 * surplus amber, a balanced variance plain. The tone comes from the shared
 * variance vocabulary, so the figure and its Status chip always agree.
 */
const VARIANCE_TEXT: Record<string, string | undefined> = {
  short: 'text-danger-fg',
  surplus: 'text-warning-fg',
};

const signedMoney = (amount: number): string => signedMoneyParts(amount, { plus: true }).text;
const signedQty = (amount: number, unit: string): string =>
  formatQuantity(amount, unit, { plus: true });

const VarianceFigure: React.FC<{ amount: number; kind: VarianceKind; children: string }> = ({
  amount,
  kind,
  children,
}) => <span className={VARIANCE_TEXT[variancePresentation(amount, kind).state]}>{children}</span>;

const SignedMoney: React.FC<{ amount: number }> = ({ amount }) => (
  <VarianceFigure amount={amount} kind="cash">
    {signedMoney(amount)}
  </VarianceFigure>
);

/** The columns whose figure is a variance, tinted by the shared vocabulary. */
const VARIANCE_COLUMNS = new Set(['variance', 'attendantVariance', 'officeVariance']);

/**
 * How a DSR cell is tinted: `short` (red) or `surplus` (amber) for a variance
 * figure or its Status, nothing for a balanced one or any other cell. The PDF
 * colours its cells by this; the screen's cells and chips follow the same rule.
 */
export function dssrCellTone<T>(col: TableColumn<T>, row: T): 'short' | 'surplus' | null {
  let state: string | null = null;
  if (col.kind === 'status') state = col.value(row);
  else if (VARIANCE_COLUMNS.has(col.id)) {
    const v = col.value(row);
    state = v == null || v === '' ? null : variancePresentation(v as number, 'cash').state;
  }
  return state === 'short' || state === 'surplus' ? state : null;
}

export const FUEL_PRODUCT_COLUMNS: TableColumn<FuelProductRow>[] = [
  { id: 'product', header: 'Product', kind: 'text', emphasis: true, value: (r) => r.product },
  { id: 'gross', header: 'Gross', kind: 'qty', unit: (r) => r.unit, value: (r) => r.gross },
  { id: 'testing', header: 'Testing', kind: 'qty', unit: (r) => r.unit, value: (r) => r.testing },
  { id: 'net', header: 'Net', kind: 'qty', unit: (r) => r.unit, value: (r) => r.net },
  { id: 'salesValue', header: 'Sales value', kind: 'money', value: (r) => r.salesValue },
];

/** On a day with more than one fuel unit, why its volumes are not added up; else null. */
export function fuelUnitsNote(fuel: DssrDay['fuel']): string | null {
  return fuel.units.length > 1 ? `volumes not added across ${fuel.units.join(' and ')}` : null;
}

/**
 * The fuel total row carries the snapshot's own totals. Volumes are never
 * added across units (L and kg), so on a mixed day the label says so and the
 * volume cells read `—`.
 */
export function fuelTotalRow(fuel: DssrDay['fuel']): TotalRow {
  const note = fuelUnitsNote(fuel);
  return {
    label: note ? `Total (${note})` : 'Total',
    values: {
      gross: fuel.totals.gross,
      testing: fuel.totals.testing,
      net: fuel.totals.net,
      salesValue: fuel.totals.salesValue,
    },
    derive: false,
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
  text: (r) => signedQty(r.variance, r.unit),
  cell: (r) => (
    <VarianceFigure amount={r.variance} kind="stock">
      {signedQty(r.variance, r.unit)}
    </VarianceFigure>
  ),
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
    text: (r) => formatDateTime(r.closedAt),
  },
  { id: 'netVolume', header: 'Net volume', kind: 'qty', unit: 'L', value: (r) => r.netVolume },
  {
    id: 'attendantVariance',
    header: 'Attendant var.',
    kind: 'money',
    value: (r) => r.attendantVariance,
    // Null for shifts closed before #287: their office variance already includes it.
    text: (r) => (r.attendantVariance == null ? '—' : signedMoney(r.attendantVariance)),
    cell: (r) => (r.attendantVariance == null ? '—' : <SignedMoney amount={r.attendantVariance} />),
  },
  {
    id: 'officeVariance',
    header: 'Office count var.',
    kind: 'money',
    value: (r) => r.officeVariance,
    text: (r) => signedMoney(r.officeVariance),
    cell: (r) => <SignedMoney amount={r.officeVariance} />,
  },
];

/**
 * The day's shift totals, as stored with the snapshot: net volume is the
 * day's net fuel volume (`fuel.totalNetVolume`), the variances the drawer
 * totals. Nothing is summed from the rows; a total the snapshot lacks stays
 * blank. On a mixed-unit day the net volume reads `—`, as the fuel total
 * does, and a shift closed before two-level variance has no attendant
 * figure: the label says both.
 */
export function shiftTotalRow(day: DssrDay): TotalRow {
  const mixed = fuelUnitsNote(day.fuel);
  const withoutAttendant = day.shifts.filter((s) => s.attendantVariance == null).length;
  const notes = [
    mixed,
    withoutAttendant > 0 &&
      `attendant var. excl. ${withoutAttendant} older ${withoutAttendant === 1 ? 'shift' : 'shifts'}`,
  ].filter(Boolean);
  return {
    label: notes.length > 0 ? `Total (${notes.join('; ')})` : 'Total',
    values: {
      netVolume: mixed ? null : day.fuel.totals.net,
      ...(day.drawerTotals.attendantVariance != null && {
        attendantVariance: day.drawerTotals.attendantVariance,
      }),
      ...(day.drawerTotals.officeVariance != null && {
        officeVariance: day.drawerTotals.officeVariance,
      }),
    },
    derive: false,
  };
}

export const ATTENDANT_COLUMNS: TableColumn<AttendantRow>[] = [
  { id: 'attendant', header: 'Attendant · DU', kind: 'text', value: (r) => r.attendant },
  {
    id: 'variance',
    header: 'Variance',
    kind: 'money',
    value: (r) => r.variance,
    text: (r) => signedMoney(r.variance),
    cell: (r) => <SignedMoney amount={r.variance} />,
    width: '22%',
  },
];

/** The attendants' total: the stored day total; blank for a snapshot without one. */
export function attendantTotalRow(day: DssrDay): TotalRow {
  const stored = day.drawerTotals.attendantVariance;
  return { values: stored == null ? {} : { variance: stored }, derive: false };
}

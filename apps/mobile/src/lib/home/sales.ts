/**
 * Home's sales figures, derived from a DSSR payload (the open day's live preview
 * or a closed day's snapshot). Pure: no React, no fetching.
 *
 * Domain rule (ADR 0005): fuel sales count CLOSED Shifts only (they come from
 * Shift Summaries; a running Shift's fuel is "counted at close"), while Product
 * Sales are live and include the open Shift.
 */
import { shiftBusinessDate } from '@pump/shared';
import { num } from './num.js';

export type Snapshot = Record<string, any>;

/** The payload of a preview (`{ snapshotData }`), a bare snapshot, or nothing. */
export function readSnapshot(data: unknown): Snapshot {
  const d = data as Snapshot | null | undefined;
  return (d?.snapshotData ?? d ?? {}) as Snapshot;
}

export interface FuelLine {
  key: string;
  name: string;
  code: string;
  quantity: number;
  unit: string;
  value: number;
}
export interface ProductLine {
  key: string;
  name: string;
  /** Units sold; 0 when the line has no quantity detail. */
  quantity: number;
  value: number;
}
export interface ClosedShift {
  key: string;
  label: string;
  sequence: number | null;
  /** Null for a snapshot frozen before per-Shift fuel value was recorded. */
  fuelValue: number | null;
}
export interface SalesFigures {
  fuel: FuelLine[];
  /** Fuel sales of closed Shifts. */
  fuelValue: number;
  /** "2,211 L", or "100 L · 40 kg": volumes are never added across units. */
  fuelVolumeLabel: string;
  products: ProductLine[];
  /** Every Product Sale of the day, open Shift included. */
  productsValue: number;
  productUnits: number;
  /** Headline: closed-Shift fuel + all Product Sales. */
  total: number;
  closedShifts: ClosedShift[];
}

/** Product lines shown before the tail is rolled into one "N other products" line. */
export const MAX_PRODUCT_LINES = 5;

const unitLabel = (unit: unknown): string => {
  const u = typeof unit === 'string' ? unit.trim() : '';
  if (!u || /^(l|litre|liter)s?$/i.test(u)) return 'L';
  if (/^(kg|kilogram)s?$/i.test(u)) return 'kg';
  return u;
};

const groupedInt = (n: number) => Math.round(n).toLocaleString('en-IN');

const shiftLabel = (s: Snapshot): string =>
  (typeof s.templateName === 'string' && s.templateName) ||
  (s.shiftSequence ? `Shift ${s.shiftSequence}` : 'Shift');

const bySequence = (a: Snapshot, b: Snapshot) =>
  (a.shiftSequence ?? Number.MAX_SAFE_INTEGER) - (b.shiftSequence ?? Number.MAX_SAFE_INTEGER);

function productLines(snap: Snapshot, productsValue: number): ProductLine[] {
  const lines: ProductLine[] = ((snap.pnl?.byProduct ?? []) as Snapshot[])
    .filter((p) => p.kind === 'merchandise')
    .map((p) => ({
      key: String(p.productId ?? p.name),
      name: String(p.name ?? 'Product'),
      quantity: num(p.quantity),
      value: num(p.revenue),
    }))
    .sort((a, b) => b.value - a.value);
  if (lines.length === 0)
    return productsValue > 0
      ? [{ key: 'products', name: 'Products', quantity: 0, value: productsValue }]
      : [];
  if (lines.length <= MAX_PRODUCT_LINES) return lines;
  const head = lines.slice(0, MAX_PRODUCT_LINES);
  const tail = lines.slice(MAX_PRODUCT_LINES);
  return [
    ...head,
    {
      key: 'other-products',
      name: `${tail.length} other products`,
      quantity: tail.reduce((s, l) => s + l.quantity, 0),
      value: tail.reduce((s, l) => s + l.value, 0),
    },
  ];
}

export function deriveSales(snap: Snapshot): SalesFigures {
  const fuel: FuelLine[] = ((snap.fuel?.byProduct ?? []) as Snapshot[])
    .map((p) => ({
      key: String(p.productId ?? p.productName),
      name: String(p.productName ?? 'Fuel'),
      code: String(p.productCode ?? ''),
      quantity: num(p.netVolume ?? p.grossVolume),
      unit: unitLabel(p.unit),
      value: num(p.salesValue),
    }))
    .sort((a, b) => b.value - a.value);

  const perUnit = new Map<string, number>();
  for (const f of fuel) perUnit.set(f.unit, (perUnit.get(f.unit) ?? 0) + f.quantity);

  const fuelValue = num(snap.fuel?.totalSalesValue);
  const productsValue = num(snap.merchandise?.salesValue);
  const products = productLines(snap, productsValue);

  const closedShifts: ClosedShift[] = ([...(snap.shifts ?? [])] as Snapshot[])
    .sort(bySequence)
    .map((s) => ({
      key: String(s.shiftId ?? s.shiftSequence ?? shiftLabel(s)),
      label: shiftLabel(s),
      sequence: s.shiftSequence ?? null,
      fuelValue: typeof s.fuelSalesValue === 'number' ? s.fuelSalesValue : null,
    }));

  return {
    fuel,
    fuelValue,
    fuelVolumeLabel:
      [...perUnit].map(([unit, qty]) => `${groupedInt(qty)} ${unit}`).join(' · ') || '0 L',
    products,
    productsValue,
    productUnits: products.reduce((s, p) => s + p.quantity, 0),
    total: fuelValue + productsValue,
    closedShifts,
  };
}

export interface SplitSegment {
  key: string;
  kind: 'closed' | 'open';
  /** Relative width; the open segment is an average closed Shift (the real figure arrives at close). */
  weight: number;
}

/**
 * The bar under the headline: each closed Shift solid, the open Shift hatched.
 * The hatched width is a placeholder, not a measurement: the open Shift's fuel is
 * unknown until it closes, and the labels beside the bar say so.
 */
export function deriveSplitBar(closed: ClosedShift[], hasOpenShift: boolean): SplitSegment[] {
  const values = closed.map((s) => Math.max(0, s.fuelValue ?? 0));
  const sum = values.reduce((a, b) => a + b, 0);
  const weights = sum > 0 ? values : closed.map(() => 1);
  const segments: SplitSegment[] = closed.map((s, i) => ({
    key: s.key,
    kind: 'closed',
    weight: weights[i],
  }));
  if (hasOpenShift) {
    const avg = segments.length ? weights.reduce((a, b) => a + b, 0) / segments.length : 1;
    segments.push({ key: 'open', kind: 'open', weight: avg });
  }
  return segments;
}

export interface Comparison {
  /** Rounded to one decimal. */
  pct: number;
  direction: 'up' | 'down' | 'flat';
  /** "Thu Shift 1", "Thu Shifts 1–2". */
  against: string;
}

const weekday = (businessDate: string) =>
  new Date(`${businessDate}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    timeZone: 'UTC',
  });

/**
 * Today's closed-Shift fuel against the same number of Shifts, from the start,
 * of the previous Business Day. Null (so the UI hides it) whenever the
 * comparison would be a guess: nothing closed yet, no previous day, too few
 * Shifts, or a previous snapshot without per-Shift fuel values.
 */
export function deriveComparison(
  today: SalesFigures,
  previous: Snapshot | null,
  previousDate: string,
): Comparison | null {
  const n = today.closedShifts.length;
  if (n === 0 || !previous) return null;
  const prevShifts = ([...(previous.shifts ?? [])] as Snapshot[]).sort(bySequence).slice(0, n);
  if (prevShifts.length < n) return null;
  if (prevShifts.some((s) => typeof s.fuelSalesValue !== 'number')) return null;
  const base = prevShifts.reduce((sum, s) => sum + (s.fuelSalesValue as number), 0);
  if (base <= 0) return null;

  const pct = Math.round(((today.fuelValue - base) / base) * 1000) / 10;
  return {
    pct,
    direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
    against: `${weekday(previousDate)} ${n === 1 ? shiftLabel(prevShifts[0]) : `Shifts 1–${n}`}`,
  };
}

export interface TrendPoint {
  date: string;
  total: number;
}

/** Closed days' total sales (fuel + products), oldest first. */
export function deriveTrend(range: readonly unknown[] | undefined): TrendPoint[] {
  return (range ?? [])
    .map((row) => {
      const r = row as Snapshot;
      const snap = readSnapshot(r);
      return {
        date: String(r.businessDate ?? snap.businessDate ?? ''),
        total: num(snap.fuel?.totalSalesValue) + num(snap.merchandise?.salesValue),
      };
    })
    .filter((p) => p.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** SVG path through `values`, spread across `width`, padded `pad` from the top and bottom. */
export function sparklinePath(values: readonly number[], width: number, height: number, pad = 3) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const y = (v: number) =>
    max === min ? height / 2 : height - pad - ((v - min) / (max - min)) * (height - pad * 2);
  const x = (i: number) => (values.length > 1 ? (i / (values.length - 1)) * width : 0);
  return values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
}

/** Window of closed days the sparkline reads: the 7 Business Dates before `date`. */
export const trendWindow = (date: string) => ({
  from: shiftBusinessDate(date, -7),
  to: shiftBusinessDate(date, -1),
});

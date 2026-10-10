/**
 * The Shift Summary page's figures. Everything comes from the immutable Shift
 * Summary snapshot and is never recomputed from live data: fuel, Product Sales,
 * the payment split, the nozzle readings (with their Dispenser Unit) and the
 * Drawer reconciliation. A snapshot frozen before a figure was added lacks it;
 * each deriver says what it does then (`products: null`, payments summed from
 * the Handovers, the Dispenser Unit from today's setup).
 */
import { productCategoryOf } from '@pump/shared';
import { num, round2 } from '../home/num.js';
import { unitLabel } from '@pump/ui';
import type { FuelLine, ProductLine, Snapshot } from '../home/sales.js';
import { deriveShiftVariance, drawerName, type ShiftVariance } from './variance.js';

export interface NozzleLine {
  key: string;
  nozzle: string;
  /** "DU1 · MS": the Dispenser Unit and the fuel code. */
  detail: string;
  opening: number;
  closing: number;
  /** Net litres sold (testing taken out). */
  litres: number;
  testing: number;
  unit: string;
}

export interface DrawerLine {
  key: string;
  du: string;
  attendant: string;
  declared: number | null;
  expected: number | null;
  /** Null until the attendant hands over. */
  variance: number | null;
}

export interface OfficeCount {
  /** "Office count vs declared" (two-level) or "Cash variance" (single-level). */
  label: string;
  counted: number;
  /** What the office expected: declared cash for two-level, expected drawer cash otherwise. */
  expected: number;
  variance: number;
}

export interface ShiftPayments {
  cash: number;
  upi: number;
  card: number;
  credit: number;
}

export interface ShiftSummaryModel {
  fuel: FuelLine[];
  fuelValue: number;
  fuelVolumeLabel: string;
  /** Product Sales; null when the snapshot predates them (they were not captured). */
  products: ShiftProducts | null;
  /** The headline: fuel + Product Sales. The same figure the Shift's history row shows. */
  total: number;
  payments: ShiftPayments;
  variance: ShiftVariance;
  nozzles: NozzleLine[];
  drawers: DrawerLine[];
  office: OfficeCount;
}

const sum = (xs: readonly Snapshot[], pick: (x: Snapshot) => unknown) =>
  round2(xs.reduce((s, x) => s + num(pick(x)), 0));

const list = (v: unknown): Snapshot[] => (Array.isArray(v) ? (v as Snapshot[]) : []);

export function deriveFuelLines(snap: Snapshot): FuelLine[] {
  return list(snap.fuelByProduct)
    .map((p) => ({
      key: String(p.productCode || p.productName),
      name: String(p.productName ?? 'Fuel'),
      code: String(p.productCode ?? ''),
      quantity: num(p.netVolume),
      unit: unitLabel(p.unit),
      value: num(p.salesValue),
    }))
    .sort((a, b) => b.value - a.value);
}

/** Volumes are never added across units: "2,360 L" or "100 L · 40 kg". */
export function volumeLabel(fuel: readonly FuelLine[]): string {
  const perUnit = new Map<string, number>();
  for (const f of fuel) perUnit.set(f.unit, (perUnit.get(f.unit) ?? 0) + f.quantity);
  return (
    [...perUnit].map(([u, q]) => `${Math.round(q).toLocaleString('en-IN')} ${u}`).join(' · ') ||
    '0 L'
  );
}

/** Nozzle → Dispenser Unit name, from the station's (static) nozzle and dispenser lists. */
export type NozzleDuNames = ReadonlyMap<string, string>;

export function nozzleDuNames(
  nozzles: readonly Snapshot[],
  dispensers: readonly Snapshot[],
): NozzleDuNames {
  const du = new Map(dispensers.map((d) => [String(d.id), String(d.name ?? d.code ?? '')]));
  return new Map(
    nozzles
      .filter((n) => du.get(String(n.duId)))
      .map((n) => [String(n.id), du.get(String(n.duId)) as string]),
  );
}

function nozzleLines(snap: Snapshot, duNames: NozzleDuNames): NozzleLine[] {
  return list(snap.nozzleReadings).map((r, i) => {
    // The reading's own Dispenser Unit; only snapshots frozen before it was stored use today's setup.
    const detail = [r.duName ?? duNames.get(String(r.nozzleId)), r.productCode || r.productName]
      .filter(Boolean)
      .join(' · ');
    return {
      key: String(r.nozzleId ?? i),
      nozzle: String(r.nozzleName ?? 'Nozzle'),
      detail,
      opening: num(r.openingReading),
      closing: num(r.closingReading),
      litres: num(r.netVolume ?? r.volumeSold),
      testing: num(r.testingVolume),
      unit: unitLabel(r.unit),
    };
  });
}

function drawerLines(snap: Snapshot): DrawerLine[] {
  return list(snap.drawers).map((d, i) => ({
    key: String(`${d.attendantId ?? ''}:${d.duId ?? i}`),
    du: drawerName({ duName: d.duName }),
    attendant: String(d.attendantName ?? 'Attendant'),
    declared: d.cashHandedOver == null ? null : num(d.cashHandedOver),
    expected: d.expectedCash == null ? null : num(d.expectedCash),
    variance: d.variance == null ? null : num(d.variance),
  }));
}

/**
 * How the Shift was paid: the snapshot's `payments`. A snapshot frozen before it
 * existed has the same figures on its Handovers, summed here.
 */
function derivePayments(snap: Snapshot): ShiftPayments {
  if (snap.payments) {
    const p = snap.payments as Snapshot;
    return { cash: num(p.cash), upi: num(p.upi), card: num(p.card), credit: num(p.credit) };
  }
  const handovers = list(snap.handovers);
  const drawers = list(snap.drawers);
  return {
    cash: snap.cashSalesSum != null ? num(snap.cashSalesSum) : sum(drawers, (d) => d.cashSales),
    upi: sum(handovers, (h) => h.upiHandedOver),
    card: sum(handovers, (h) => h.cardHandedOver),
    credit:
      snap.creditSalesTotal != null && num(snap.creditSalesTotal) > 0
        ? num(snap.creditSalesTotal)
        : sum(handovers, (h) => h.creditHandedOver),
  };
}

export interface ShiftProducts {
  lines: ProductLine[];
  /** Σ sale totals (what the DSSR counts), which tax can put above the line sum. */
  total: number;
}

/** Product Sales from the snapshot, one line per product id; null for a snapshot without them. */
export function deriveShiftProducts(snap: Snapshot): ShiftProducts | null {
  const ps = snap.productSales as Snapshot | undefined;
  if (!ps) return null;
  return {
    lines: list(ps.lines).map((l) => ({
      key: String(l.productId ?? l.productName),
      name: String(l.productName ?? 'Product'),
      productType: productCategoryOf(l.productType),
      quantity: num(l.quantity),
      value: num(l.value),
    })),
    total: num(ps.total),
  };
}

export interface SalesTotals {
  fuel: number;
  /** Null when the snapshot predates Product Sales. */
  products: number | null;
  total: number;
}

/**
 * A Shift's sales as its snapshot states them. The history row, the day total
 * and the page's headline all read this, so they cannot disagree: total sales
 * is fuel plus Product Sales (fuel alone for a snapshot that predates them).
 */
export function deriveSalesTotals(snap: Snapshot): SalesTotals {
  const fuel =
    snap.totalFuelSalesValue != null
      ? num(snap.totalFuelSalesValue)
      : sum(list(snap.fuelByProduct), (f) => f.salesValue);
  const products = snap.productSales ? num((snap.productSales as Snapshot).total) : null;
  return {
    fuel,
    products,
    total:
      snap.totalSalesValue != null ? num(snap.totalSalesValue) : round2(fuel + (products ?? 0)),
  };
}

function deriveOffice(snap: Snapshot, v: ShiftVariance): OfficeCount {
  const counted = num(snap.closingCash);
  // Two-level: the office expects what the Drawers declared; `expectedCash` is that figure.
  return {
    label: v.twoLevel ? 'Office count vs declared' : 'Cash variance',
    counted,
    expected: num(snap.expectedCash),
    variance: v.office,
  };
}

export function deriveShiftSummary(snap: Snapshot, duNames: NozzleDuNames): ShiftSummaryModel {
  const fuel = deriveFuelLines(snap);
  const variance = deriveShiftVariance(snap);
  const totals = deriveSalesTotals(snap);
  return {
    fuel,
    fuelValue: totals.fuel,
    fuelVolumeLabel: volumeLabel(fuel),
    products: deriveShiftProducts(snap),
    total: totals.total,
    payments: derivePayments(snap),
    variance,
    nozzles: nozzleLines(snap, duNames),
    drawers: drawerLines(snap),
    office: deriveOffice(snap, variance),
  };
}

export interface PaymentSlice {
  key: 'cash' | 'upi' | 'card' | 'credit';
  label: string;
  amount: number;
}

/** The four ways a Shift was paid, as the snapshot declares them. */
export function derivePaymentSlices(p: ShiftPayments): PaymentSlice[] {
  return [
    { key: 'cash', label: 'Cash', amount: p.cash },
    { key: 'upi', label: 'UPI', amount: p.upi },
    { key: 'card', label: 'Card', amount: p.card },
    { key: 'credit', label: 'Credit', amount: p.credit },
  ];
}

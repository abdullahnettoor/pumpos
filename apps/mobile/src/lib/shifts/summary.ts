/**
 * The Shift Summary page's figures. Everything comes from the immutable Shift
 * Summary snapshot (never recomputed) except Product Sales, which a snapshot
 * does not carry: those are read from the Shift's merchandise endpoints and
 * folded in by `deriveShiftProducts`.
 */
import { num, round2 } from '../home/num.js';
import {
  unitLabel,
  rollUpProducts,
  type FuelLine,
  type ProductLine,
  type Snapshot,
} from '../home/sales.js';
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
    const detail = [duNames.get(String(r.nozzleId)), r.productCode || r.productName]
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

/** Cash the Drawers declared as sales: the server's `cashSalesSum`, else Σ Drawer cash sales. */
function derivePayments(snap: Snapshot): ShiftPayments {
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
  return {
    fuel,
    fuelValue:
      snap.totalFuelSalesValue != null ? num(snap.totalFuelSalesValue) : sum(fuel, (f) => f.value),
    fuelVolumeLabel: volumeLabel(fuel),
    payments: derivePayments(snap),
    variance,
    nozzles: nozzleLines(snap, duNames),
    drawers: drawerLines(snap),
    office: deriveOffice(snap, variance),
  };
}

/** A merchandise handover or billed sale as the two endpoints return it. */
export interface MerchSaleRead {
  totalAmount?: number | string | null;
  items?: {
    productId?: string | null;
    productName?: string | null;
    quantity?: number | string | null;
    lineTotal?: number | string | null;
  }[];
}

export interface ShiftProducts {
  lines: ProductLine[];
  /** Σ sale totals (what the DSSR counts), which tax can put above the line sum. */
  total: number;
}

/**
 * The Shift's Product Sales: bulk Handover sales and individually billed sales,
 * grouped by product. Merchandise is a Shift's Sale (ADR 0005) but its Shift
 * Summary snapshot holds only fuel, so this is read live.
 */
export function deriveShiftProducts(
  handovers: readonly MerchSaleRead[],
  billed: readonly MerchSaleRead[],
): ShiftProducts {
  const sales = [...handovers, ...billed];
  const byProduct = new Map<string, ProductLine>();
  for (const sale of sales) {
    for (const it of sale.items ?? []) {
      const name = String(it.productName ?? 'Product');
      // Billed sale items carry only the product name, so the name is the one key both reads share.
      const key = name.trim().toLowerCase();
      const line = byProduct.get(key) ?? {
        key: String(it.productId ?? key),
        name,
        quantity: 0,
        value: 0,
      };
      line.quantity += num(it.quantity);
      line.value += num(it.lineTotal);
      byProduct.set(key, line);
    }
  }
  return {
    lines: rollUpProducts([...byProduct.values()].map((l) => ({ ...l, value: round2(l.value) }))),
    total: round2(sales.reduce((s, x) => s + num(x.totalAmount), 0)),
  };
}

export interface PaymentSlice {
  key: 'cash' | 'upi' | 'card' | 'credit' | 'other';
  label: string;
  amount: number;
}

/**
 * Payment split of the Shift's total sales. Cash, UPI, card and credit are the
 * declared figures; what they do not account for (OMC fuel cards, counter card
 * sales) shows as "Other" rather than being hidden. `total` is null while Product
 * Sales are still loading: "Other" is only worked out against the full total.
 */
export function derivePaymentSlices(p: ShiftPayments, total: number | null): PaymentSlice[] {
  const slices: PaymentSlice[] = [
    { key: 'cash', label: 'Cash', amount: p.cash },
    { key: 'upi', label: 'UPI', amount: p.upi },
    { key: 'card', label: 'Card', amount: p.card },
    { key: 'credit', label: 'Credit', amount: p.credit },
  ];
  if (total !== null) {
    const other = round2(total - (p.cash + p.upi + p.card + p.credit));
    if (other >= 1) slices.push({ key: 'other', label: 'Other', amount: other });
  }
  return slices;
}

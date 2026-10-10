/**
 * The DSSR page's figures, read from the DSSR payload (a Sealed day's immutable
 * snapshot or a Draft day's preview; same shape). Pure: nothing is recomputed
 * from live data. The summary tiles and Sales by product come from the same
 * derivers as Home (`deriveTiles`, `deriveSales`), so one day never reads two
 * ways on two screens.
 */
import type { BusinessDayListItem } from '@pump/shared';
import { stationTime } from '../home/dates.js';
import { num } from '../home/num.js';
import { shiftLabel, unitLabel, type Snapshot } from '../home/sales.js';
import { varianceBadge, type VarianceBadgeView } from '../variance.js';

/** A tank whose book-vs-dip variance is inside this many litres reads as level. */
export const STOCK_VARIANCE_TOLERANCE = 1;

const grouped = (n: number, decimals = 0) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export interface DssrShiftRow {
  shiftId: string;
  /** `S1`, or `•` when the snapshot has no Shift sequence. */
  chip: string;
  title: string;
  /** "Closed 1:58 pm · 2,210 L". */
  meta: string;
  /** Fuel sales of the Shift; null for a snapshot frozen before it was recorded. */
  fuelValue: number | null;
  /** Office count variance (legacy snapshots: the single-level variance). */
  badge: VarianceBadgeView;
}

/** Closed Shifts of the day in Shift order. */
export function deriveShiftRows(snap: Snapshot, timeZone: string): DssrShiftRow[] {
  const shifts = ([...(snap.shifts ?? [])] as Snapshot[]).sort(
    (a, b) =>
      (a.shiftSequence ?? Number.MAX_SAFE_INTEGER) - (b.shiftSequence ?? Number.MAX_SAFE_INTEGER),
  );
  return shifts.map((s) => {
    const closed = s.closedAt ? Date.parse(s.closedAt) : NaN;
    const meta = [
      Number.isFinite(closed) ? `Closed ${stationTime(closed, timeZone)}` : undefined,
      `${grouped(num(s.netVolume))} L`,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      shiftId: String(s.shiftId),
      chip: s.shiftSequence ? `S${s.shiftSequence}` : '•',
      title: shiftLabel(s),
      meta,
      fuelValue: typeof s.fuelSalesValue === 'number' ? s.fuelSalesValue : null,
      badge: varianceBadge(num(s.cashVariance)),
    };
  });
}

export interface TankMovementRow {
  key: string;
  /** "Tank 1 · Petrol". */
  title: string;
  /** "Book 14,820 → Dip 14,802 L". */
  movement: string;
  /** "Sold 2,210 L" when the product sold from this tank alone; otherwise absent. */
  sold?: string;
  /** "−18 L", "+4 L", "0 L". */
  variance: string;
  tone: 'bad' | 'warn' | 'default';
}

const signedLitres = (v: number, unit: string) =>
  `${v < 0 ? '−' : v > 0 ? '+' : ''}${grouped(Math.abs(v), 1).replace(/\.0$/, '')} ${unit}`;

/**
 * Fuel stock per tank at day close: book (expected) against the dip (actual) and
 * the variance in litres, red when short beyond tolerance. "Sold" is the
 * product's net volume and is shown only when the product has a single tank,
 * because the snapshot does not split sales by tank.
 */
export function deriveTankMovement(snap: Snapshot): TankMovementRow[] {
  const rows = (snap.fuelStockVariance ?? []) as Snapshot[];
  const soldByProduct = new Map<string, Snapshot>(
    ((snap.fuel?.byProduct ?? []) as Snapshot[]).map((p) => [String(p.productName), p]),
  );
  const tanksOfProduct = new Map<string, number>();
  for (const r of rows)
    tanksOfProduct.set(String(r.productName), (tanksOfProduct.get(String(r.productName)) ?? 0) + 1);

  return rows.map((r, i) => {
    const unit = unitLabel(r.unit);
    const v = num(r.varianceQuantity);
    const product = String(r.productName ?? '');
    const sold = tanksOfProduct.get(product) === 1 ? soldByProduct.get(product) : undefined;
    return {
      key: `${r.tankName ?? 'tank'}-${i}`,
      title: [r.tankName, r.productName].filter(Boolean).join(' · ') || 'Tank',
      movement: `Book ${grouped(num(r.expectedQuantity))} → Dip ${grouped(num(r.actualQuantity))} ${unit}`,
      sold: sold ? `Sold ${grouped(num(sold.netVolume ?? sold.grossVolume))} ${unit}` : undefined,
      variance: signedLitres(v, unit),
      tone:
        v < -STOCK_VARIANCE_TOLERANCE ? 'bad' : v > STOCK_VARIANCE_TOLERANCE ? 'warn' : 'default',
    };
  });
}

export type StepTarget = { kind: 'day'; date: string } | { kind: 'home' } | { kind: 'load' };

export interface StepTargets {
  /** Previous (older) day. `load`: not in the loaded months yet, fetch the next older month. */
  older: StepTarget | null;
  /** Next (newer) day. `home`: the Live day, which has no DSSR until it closes. */
  newer: StepTarget | null;
}

const hasDssr = (d: Pick<BusinessDayListItem, 'status'>) =>
  d.status === 'DRAFT' || d.status === 'SEALED';

/**
 * Where ‹ and › lead from `date`, across the Reports list's days (newest first).
 * Days without a DSSR to show (Report missing) are skipped. Stepping newer into
 * the Live day goes Home, only when Home is reachable. A date outside the loaded
 * list has no neighbours.
 */
export function stepTargets(
  days: readonly Pick<BusinessDayListItem, 'businessDate' | 'status'>[],
  date: string,
  opts: { hasOlderMonths: boolean; canGoHome: boolean },
): StepTargets {
  const at = days.findIndex((d) => d.businessDate === date);
  if (at < 0) return { older: null, newer: null };

  const older = days.slice(at + 1).find(hasDssr);
  const newerDays = days.slice(0, at).reverse();
  const newer = newerDays.find((d) => hasDssr(d) || d.status === 'LIVE');
  return {
    older: older
      ? { kind: 'day', date: older.businessDate }
      : opts.hasOlderMonths
        ? { kind: 'load' }
        : null,
    newer: !newer
      ? null
      : newer.status === 'LIVE'
        ? opts.canGoHome
          ? { kind: 'home' }
          : null
        : { kind: 'day', date: newer.businessDate },
  };
}

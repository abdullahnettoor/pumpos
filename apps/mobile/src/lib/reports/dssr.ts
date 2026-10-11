/**
 * The DSSR page's figures, read from the DSSR payload (a Sealed day's immutable
 * snapshot or a Draft day's preview; same shape). Pure: nothing is recomputed
 * from live data. The summary tiles and Sales by product come from the same
 * derivers as Home (`deriveTiles`, `deriveSales`), so one day never reads two
 * ways on two screens.
 */
import { isStockVarianceWithinTolerance, readDssrOmcCard, type DssrOmcCard } from '@pump/shared';
import type { BusinessDayListItem } from '@pump/shared';
import { stationTime } from '../dates.js';
import { num } from '../num.js';
import { unitLabel } from '@pump/ui';
import { shiftLabel, type Snapshot } from '../home/sales.js';
import { varianceBadge, type VarianceBadgeView } from '../variance.js';
import type { LiveTab } from './days.js';

const grouped = (n: number, decimals = 0) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/**
 * The day's OMC Card Sales (fuel paid by an Oil Marketing Company card, settled
 * to the OMC Wallet): shown beside Credit Sales so the money has a home. The
 * shared DSSR rule (`readDssrOmcCard`): null for a snapshot frozen before the
 * field existed, and for a day without any.
 */
export const deriveOmcCard = (snap: Snapshot): DssrOmcCard | null => readDssrOmcCard(snap);

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
  /** "Opening 14,450 → Closing 12,560 L"; a snapshot frozen before #395: "Book 14,820 → Dip 14,802 L". */
  movement: string;
  /**
   * Detail lines under `movement`, each short enough for a 390px row with 5-digit
   * litres: ["Sold 2,210 L · Received 300 L", "Dip 12,290 L"]; an old snapshot: ["Sold 2,210 L"]
   * for a one-tank product, else none.
   */
  detail: string[];
  /** "−18 L", "+4 L", "0 L". */
  variance: string;
  tone: 'bad' | 'warn' | 'default';
}

const litres = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 1 });
const signedLitres = (v: number, unit: string) =>
  `${v < 0 ? '−' : v > 0 ? '+' : ''}${litres(Math.abs(v))} ${unit}`;

/**
 * Fuel stock per tank at day close, from the snapshot's `fuelStockVariance`
 * rows. Newer snapshots carry the tank's `tankMovement` (opening, received,
 * sold, closing book): shown as opening → closing with Sold, Received and the
 * Dip. A snapshot frozen earlier has book / dip only, so it shows Book → Dip
 * and "Sold" (the product's net volume) only when the product has one tank. The
 * variance is red when short, amber when over, beyond the shared tolerance
 * (a share of the litres the tank sold; unknown sales tolerate no variance).
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
    const m = r.tankMovement as Snapshot | undefined;
    const productSold = tanksOfProduct.get(product) === 1 ? soldByProduct.get(product) : undefined;
    const sold = m
      ? num(m.soldQuantity)
      : productSold
        ? num(productSold.netVolume ?? productSold.grossVolume)
        : null;

    let movement: string;
    let detail: string[] = [];
    if (m) {
      movement = `Opening ${litres(num(m.openingQuantity))} → Closing ${litres(num(m.closingQuantity))} ${unit}`;
      detail = [
        [
          `Sold ${litres(num(m.soldQuantity))} ${unit}`,
          num(m.receivedQuantity) > 0 ? `Received ${litres(num(m.receivedQuantity))} ${unit}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        `Dip ${litres(num(r.actualQuantity))} ${unit}`,
      ];
    } else {
      movement = `Book ${litres(num(r.expectedQuantity))} → Dip ${litres(num(r.actualQuantity))} ${unit}`;
      detail = sold === null ? [] : [`Sold ${litres(sold)} ${unit}`];
    }
    return {
      key: `${r.tankName ?? 'tank'}-${i}`,
      title: [r.tankName, r.productName].filter(Boolean).join(' · ') || 'Tank',
      movement,
      detail,
      variance: signedLitres(v, unit),
      tone: isStockVarianceWithinTolerance(v, sold) ? 'default' : v < 0 ? 'bad' : 'warn',
    };
  });
}

export type StepTarget =
  { kind: 'day'; date: string } | { kind: 'live'; tab: LiveTab } | { kind: 'load' };

export interface StepTargets {
  /** Previous (older) day. `load`: not in the loaded months yet, fetch the next older month. */
  older: StepTarget | null;
  /** Next (newer) day. `live`: the Live day, which has no DSSR until it closes (opens the Role's live-day tab). */
  newer: StepTarget | null;
}

const hasDssr = (d: Pick<BusinessDayListItem, 'status'>) =>
  d.status === 'DRAFT' || d.status === 'SEALED';

/**
 * Where ‹ and › lead from `date`, across the Reports list's days (newest first).
 * Days without a DSSR to show (Report missing) are skipped. Stepping newer into
 * the Live day opens `liveTab` (Home, or Shifts for a Role without Home), only when the Role has one. A date outside the loaded
 * list has no neighbours.
 */
export function stepTargets(
  days: readonly Pick<BusinessDayListItem, 'businessDate' | 'status'>[],
  date: string,
  opts: { hasOlderMonths: boolean; liveTab: LiveTab | null },
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
        ? opts.liveTab
          ? { kind: 'live', tab: opts.liveTab }
          : null
        : { kind: 'day', date: newer.businessDate },
  };
}

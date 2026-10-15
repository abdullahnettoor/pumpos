import {
  compareByDispenserThenNozzle,
  compareNatural,
  dispenserLabel,
  handoverState,
  handoverStatus,
  isBalancedVariance,
  isHandoverDue,
  type HandoverStatusState,
  type ShiftStatusState,
} from '@pump/shared';
import { sumRupees, toPaise } from '../../utils/ledgerWindow.js';

/**
 * The Live shift's figures (#533, layout B): the nozzle readings grouped by
 * Drawer, the four "This shift" tiles, the takings summary, the Product sales
 * rows and the Before close checklist. Pure: every figure on the Live shift tab
 * is worked out here, from the shift-status payload and the Product Sale lists,
 * so the components only lay them out. Money is summed in whole paise.
 *
 * The formulas are the ones the screen used before the redesign (volume =
 * closing − opening, value = volume × rate, attendant variance from the server
 * reconciliation); this module only regroups them.
 */

// ── Inputs: the slices of the shift-status payload this module reads ────────

type Num = number | string | null | undefined;

export interface NozzleReadingInput {
  nozzleId: string;
  nozzleName?: string | null;
  duId?: string | null;
  duCode?: string | null;
  duName?: string | null;
  productId?: string | null;
  productName?: string | null;
  productCode?: string | null;
  unit?: string | null;
  openingReading: Num;
  closingReading: Num;
  unitPrice?: Num;
}

export interface StaffAssignmentInput {
  userId: string;
  userName?: string | null;
  duId: string;
  duCode?: string | null;
  duName?: string | null;
}

export interface HandoverInput {
  id?: string;
  userId: string;
  duId: string;
  cashHandedOver?: Num;
  cardHandedOver?: Num;
  upiHandedOver?: Num;
  creditHandedOver?: Num;
  varianceAmount?: Num;
  cashDrops?: Num;
  createdAt?: string | null;
}

/** A Drawer as the server reconciles it; `variance` is null until it hands over. */
export interface ReconDrawerInput {
  attendantId: string;
  duId?: string | null;
  variance: number | null;
  cashDrops?: Num;
}

export interface ShiftInput {
  openedAt: string;
  scheduledEndTime?: string | null;
  nozzleReadings?: NozzleReadingInput[] | null;
  staffAssignments?: StaffAssignmentInput[] | null;
  handovers?: HandoverInput[] | null;
  reconciliation?: { drawers?: ReconDrawerInput[] | null } | null;
}

/** A Handover Product Sale (one per employee per shift). */
export interface HandoverProductSaleInput {
  id: string;
  attendantId?: string | null;
  attendantName?: string | null;
  totalAmount: Num;
}

/** A Billed Sale recorded during the shift. */
export interface BilledSaleInput {
  id?: string;
  attendantId?: string | null;
  attendantName?: string | null;
  totalAmount: Num;
}

/** Card / UPI / credit before any Handover: the shift's own transaction totals. */
export interface PreHandoverTotals {
  card: number;
  upi: number;
  credit: number;
}

// ── Nozzle readings, grouped by Drawer ──────────────────────────────────────

export interface NozzleRow {
  nozzleId: string;
  nozzle: string;
  product: string;
  /** The product's id (or name), for the product filter. */
  productKey: string;
  unit: string;
  opening: number;
  /** Null while the Drawer has not handed over and the meter has not moved. */
  closing: number | null;
  litres: number | null;
  rate: number;
  value: number | null;
}

export interface NozzleGroup {
  /** `${userId}|${duId}`, or `unassigned`. */
  key: string;
  /** "DU1 · Ravi Kumar". */
  label: string;
  /** "DU1"; empty for unassigned nozzles. */
  du: string;
  /** The staff assignment the Record / View handover button opens; null for unassigned nozzles. */
  assignment: StaffAssignmentInput | null;
  handover: HandoverInput | null;
  status: HandoverStatusState | null;
  rows: NozzleRow[];
}

const DRAWER_KEY = (userId: string, duId: string) => `${userId}|${duId}`;
const n = (v: Num) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
/** Litres to the meter's 3 decimals, so a difference of readings reads as shown. */
const litres3 = (v: number) => Math.round(v * 1000) / 1000;
const rupees2 = (v: number) => Math.round(v * 100) / 100;

const duText = (d: { duCode?: string | null; duName?: string | null }) => dispenserLabel(d) || 'DU';

/**
 * The nozzle table's groups: one per Drawer (DU · attendant), in dispenser
 * order, each with its nozzles. Nozzles on no assigned DU form a last
 * "Unassigned" group. A Drawer that has not handed over shows its closing,
 * litres and value as blanks while its meter is unmoved (the reading is taken
 * in the Handover); the figures behind them are unchanged (zero).
 */
export function nozzleGroups(
  shift: ShiftInput,
  opts: { now: number; timeZone?: string },
): NozzleGroup[] {
  const readings = [...(shift.nozzleReadings ?? [])].sort(
    compareByDispenserThenNozzle<NozzleReadingInput>(dispenserLabel, (r) => r.nozzleName),
  );
  const assignments = [...(shift.staffAssignments ?? [])].sort((a, b) =>
    compareNatural(duText(a), duText(b)),
  );
  const handovers = shift.handovers ?? [];
  const due =
    !!opts.timeZone &&
    isHandoverDue(shift.openedAt, opts.now, shift.scheduledEndTime, opts.timeZone);

  const toRow = (r: NozzleReadingInput, recorded: boolean): NozzleRow => {
    const opening = n(r.openingReading);
    const closing = n(r.closingReading);
    const volume = closing - opening;
    const rate = n(r.unitPrice);
    const blank = !recorded && litres3(volume) === 0;
    return {
      nozzleId: r.nozzleId,
      nozzle: r.nozzleName || 'Nozzle',
      product: r.productName || 'Unknown',
      productKey: r.productId || r.productName || 'unknown',
      unit: r.unit || 'L',
      opening,
      closing: blank ? null : closing,
      litres: blank ? null : litres3(volume),
      rate,
      value: blank ? null : rupees2(volume * rate),
    };
  };

  const claimed = new Set<string>();
  const groups: NozzleGroup[] = assignments.map((a) => {
    const handover = handovers.find((h) => h.userId === a.userId && h.duId === a.duId) ?? null;
    const mine = readings.filter((r) => r.duId === a.duId && !claimed.has(r.nozzleId));
    // A DU worked by one attendant: its nozzles sit under that Drawer once.
    mine.forEach((r) => claimed.add(r.nozzleId));
    return {
      key: DRAWER_KEY(a.userId, a.duId),
      label: `${duText(a)} · ${a.userName || 'Attendant'}`,
      du: duText(a),
      assignment: a,
      handover,
      status: handoverState(handoverStatus(!!handover, due)),
      rows: mine.map((r) => toRow(r, !!handover)),
    };
  });
  const rest = readings.filter((r) => !claimed.has(r.nozzleId));
  if (rest.length > 0) {
    groups.push({
      key: 'unassigned',
      label: 'Unassigned',
      du: '',
      assignment: null,
      handover: null,
      status: null,
      rows: rest.map((r) => toRow(r, false)),
    });
  }
  return groups;
}

export interface FuelTotals {
  /** Σ litres per unit (fuel is normally all litres). */
  byUnit: { unit: string; litres: number }[];
  /** Σ litres per product, in the order products first appear. */
  byProduct: { productKey: string; product: string; unit: string; litres: number }[];
  /** Σ value, rupees (summed in paise). */
  value: number;
}

/** What the nozzle rows add up to. A blank (pending) row adds nothing. */
export function fuelTotals(rows: NozzleRow[]): FuelTotals {
  const unitMl = new Map<string, number>();
  const product = new Map<string, { product: string; unit: string; ml: number }>();
  let valueP = 0;
  for (const r of rows) {
    if (r.litres == null) continue;
    const ml = Math.round(r.litres * 1000);
    unitMl.set(r.unit, (unitMl.get(r.unit) ?? 0) + ml);
    const p = product.get(r.productKey) ?? { product: r.product, unit: r.unit, ml: 0 };
    p.ml += ml;
    product.set(r.productKey, p);
    valueP += toPaise(r.value);
  }
  return {
    byUnit: [...unitMl].map(([unit, ml]) => ({ unit, litres: ml / 1000 })),
    byProduct: [...product].map(([productKey, p]) => ({
      productKey,
      product: p.product,
      unit: p.unit,
      litres: p.ml / 1000,
    })),
    value: valueP / 100,
  };
}

// ── Drawers: variance and drops ─────────────────────────────────────────────

/** Variances beyond this many rupees are flagged before close (the close review's threshold). */
export const VARIANCE_FLAG_RUPEES = 100;

export interface DrawerFigures {
  /** Drawers on the shift (one per staff assignment). */
  expected: number;
  /** Drawers that handed over. */
  recorded: number;
  /** Σ attendant variance of the recorded Drawers (declared + drops − expected). */
  variance: number;
  short: number;
  surplus: number;
  balanced: number;
  /** Groups whose variance is beyond `VARIANCE_FLAG_RUPEES`, largest first. */
  flagged: { key: string; variance: number }[];
  /** Σ Cash Drops recorded on the Handovers. */
  drops: number;
  /** Drawers with at least one Cash Drop. */
  dropDrawers: number;
}

/**
 * The Drawers' variance and drops. The server reconciliation is the source
 * (as at close); before it lists any Drawer, the Handovers' own figures.
 */
export function drawerFigures(shift: ShiftInput): DrawerFigures {
  const assignments = shift.staffAssignments ?? [];
  const handovers = shift.handovers ?? [];
  const recon = shift.reconciliation?.drawers ?? [];
  const lines: { key: string; variance: number | null; drops: number }[] =
    recon.length > 0
      ? recon.map((d) => ({
          key: DRAWER_KEY(d.attendantId, d.duId ?? ''),
          variance: d.variance == null ? null : n(d.variance),
          drops: n(d.cashDrops),
        }))
      : handovers.map((h) => ({
          key: DRAWER_KEY(h.userId, h.duId),
          variance: n(h.varianceAmount),
          drops: n(h.cashDrops),
        }));
  const recorded = lines.filter((l) => l.variance != null) as {
    key: string;
    variance: number;
    drops: number;
  }[];
  const flagged = recorded
    .filter((l) => Math.abs(l.variance) > VARIANCE_FLAG_RUPEES)
    .map((l) => ({ key: l.key, variance: l.variance }))
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  return {
    expected: assignments.length,
    recorded: handovers.filter((h) =>
      assignments.some((a) => a.userId === h.userId && a.duId === h.duId),
    ).length,
    variance: sumRupees(recorded.map((l) => l.variance)),
    short: recorded.filter((l) => !isBalancedVariance(l.variance) && l.variance < 0).length,
    surplus: recorded.filter((l) => !isBalancedVariance(l.variance) && l.variance > 0).length,
    balanced: recorded.filter((l) => isBalancedVariance(l.variance)).length,
    flagged,
    drops: sumRupees(lines.map((l) => l.drops)),
    dropDrawers: lines.filter((l) => toPaise(l.drops) > 0).length,
  };
}

// ── Takings ─────────────────────────────────────────────────────────────────

export interface Takings {
  /** Cash sales the Drawers declared (floats excluded), from the close summary. */
  cash: number;
  card: number;
  upi: number;
  credit: number;
  /** Σ of the four. */
  total: number;
  /** Card + UPI + credit: the money that is not Drawer cash. */
  nonCash: number;
}

/**
 * What the shift has taken, by how it was paid. Card, UPI and credit are the
 * Handovers' declared figures; before any Handover, the shift's own totals (as
 * the old operational summary read them). Cash is the declared cash sales of
 * the close summary (`cashDeclared`).
 */
export function takings(
  shift: ShiftInput,
  cashDeclared: number,
  before: PreHandoverTotals,
): Takings {
  const handovers = shift.handovers ?? [];
  const has = handovers.length > 0;
  const card = has ? sumRupees(handovers.map((h) => h.cardHandedOver)) : rupees2(before.card);
  const upi = has ? sumRupees(handovers.map((h) => h.upiHandedOver)) : rupees2(before.upi);
  const credit = has ? sumRupees(handovers.map((h) => h.creditHandedOver)) : rupees2(before.credit);
  const cash = rupees2(cashDeclared);
  return {
    cash,
    card,
    upi,
    credit,
    nonCash: sumRupees([card, upi, credit]),
    total: sumRupees([cash, card, upi, credit]),
  };
}

// ── Product sales, one row per employee ─────────────────────────────────────

export interface ProductSalesRow {
  /** The employee's user id, or null for sales with no employee. */
  attendantId: string | null;
  name: string;
  /** Σ Billed Sales by this employee. */
  billed: number;
  /** Their Handover Product Sale, or null when none is recorded. */
  handoverSale: HandoverProductSaleInput | null;
  handover: number;
  total: number;
  /** On a DU this shift (a Drawer). */
  onDrawer: boolean;
}

export interface ProductSales {
  rows: ProductSalesRow[];
  billed: number;
  handover: number;
  total: number;
}

/**
 * Product sales per employee: every attendant on a DU (a row even with no
 * sales, so their Handover Product Sale can be recorded), every other employee
 * who sold, and "Unassigned" for Billed Sales with no employee. Attendants come
 * first in dispenser order, then everyone else by name, Unassigned last.
 */
export function productSales(input: {
  assignments: StaffAssignmentInput[];
  handoverSales: HandoverProductSaleInput[];
  billed: BilledSaleInput[];
}): ProductSales {
  const rows = new Map<string, ProductSalesRow & { billedP: number; order: number }>();
  const keyOf = (id: string | null | undefined) => id || '__none__';
  const ensure = (
    id: string | null | undefined,
    name: string | null | undefined,
    order: number,
  ) => {
    const key = keyOf(id);
    let row = rows.get(key);
    if (!row) {
      row = {
        attendantId: id || null,
        name: id ? name || 'Employee' : 'Unassigned',
        billed: 0,
        billedP: 0,
        handoverSale: null,
        handover: 0,
        total: 0,
        onDrawer: false,
        order,
      };
      rows.set(key, row);
    } else if (id && name && row.name === 'Employee') row.name = name;
    return row;
  };

  const drawers = [...input.assignments].sort((a, b) => compareNatural(duText(a), duText(b)));
  drawers.forEach((a, i) => {
    const row = ensure(a.userId, a.userName, i);
    row.onDrawer = true;
  });
  const others = drawers.length;
  for (const h of input.handoverSales) {
    const row = ensure(h.attendantId, h.attendantName, others);
    row.handoverSale = h;
  }
  for (const b of input.billed) {
    const row = ensure(b.attendantId, b.attendantName, others);
    row.billedP += toPaise(b.totalAmount);
  }

  const list = [...rows.values()]
    .map((r) => {
      const handoverP = toPaise(r.handoverSale?.totalAmount);
      return {
        ...r,
        billed: r.billedP / 100,
        handover: handoverP / 100,
        total: (r.billedP + handoverP) / 100,
      };
    })
    .sort(
      (a, b) =>
        Number(a.attendantId === null) - Number(b.attendantId === null) ||
        a.order - b.order ||
        a.name.localeCompare(b.name),
    )
    .map(({ billedP: _b, order: _o, ...row }) => row);

  return {
    rows: list,
    billed: sumRupees(list.map((r) => r.billed)),
    handover: sumRupees(list.map((r) => r.handover)),
    total: sumRupees(list.map((r) => r.total)),
  };
}

// ── Before close ────────────────────────────────────────────────────────────

export type CheckState = 'done' | 'warn' | 'pending';

/** Where an item's link goes: a Drawer's Handover, or the close flow. */
export type CheckAction =
  { kind: 'handover'; groupKey: string; label: string } | { kind: 'close'; label: string };

export interface CheckItem {
  id: 'readings' | 'handovers' | 'drops' | 'variances' | 'office-count';
  label: string;
  /** The item's state in words ("4 of 6 nozzles"). */
  meta: string;
  state: CheckState;
  action: CheckAction | null;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The Before close checklist: readings captured, every Drawer handed over,
 * Cash Drops, variances, and the office cash count (taken in the close flow).
 * Each item links to where it is fixed.
 */
export function beforeCloseChecklist(
  groups: NozzleGroup[],
  drawers: DrawerFigures,
  formatMoney: (rupees: number) => string,
): CheckItem[] {
  const drawerGroups = groups.filter((g) => g.assignment);
  const pending = drawerGroups.filter((g) => !g.handover);
  const firstPending: CheckAction | null = pending[0]
    ? { kind: 'handover', groupKey: pending[0].key, label: `Record ${pending[0].label} handover` }
    : null;
  const nozzles = groups.flatMap((g) => g.rows.map((r) => ({ r, recorded: !!g.handover })));
  const captured = nozzles.filter((x) => x.recorded).length;
  const flagged = drawers.flagged[0]
    ? groups.find((g) => g.key === drawers.flagged[0].key)
    : undefined;

  return [
    {
      id: 'readings',
      label: 'Closing readings',
      meta: `${captured} of ${plural(nozzles.length, 'nozzle', 'nozzles')}`,
      state: nozzles.length > 0 && captured === nozzles.length ? 'done' : 'pending',
      action: captured < nozzles.length ? firstPending : null,
    },
    {
      id: 'handovers',
      label: 'Handovers',
      meta: `${drawers.recorded} of ${drawers.expected} recorded`,
      state: drawers.expected > 0 && pending.length === 0 ? 'done' : 'pending',
      action: firstPending,
    },
    {
      id: 'drops',
      label: 'Cash drops',
      meta:
        drawers.dropDrawers > 0
          ? `${formatMoney(drawers.drops)} · ${plural(drawers.dropDrawers, 'drawer', 'drawers')}`
          : 'None recorded',
      state: pending.length === 0 ? 'done' : 'pending',
      action: pending.length > 0 ? firstPending : null,
    },
    {
      id: 'variances',
      label: 'Variances',
      meta:
        drawers.flagged.length > 0
          ? `${drawers.flagged.length} over ${formatMoney(VARIANCE_FLAG_RUPEES)}`
          : drawers.recorded > 0
            ? `Within ${formatMoney(VARIANCE_FLAG_RUPEES)}`
            : 'None yet',
      state:
        drawers.flagged.length > 0
          ? 'warn'
          : drawers.recorded > 0 && pending.length === 0
            ? 'done'
            : 'pending',
      action: flagged
        ? { kind: 'handover', groupKey: flagged.key, label: `View ${flagged.label} handover` }
        : null,
    },
    {
      id: 'office-count',
      label: 'Office cash count',
      meta: 'At close',
      state: 'pending',
      action: { kind: 'close', label: 'Count at close' },
    },
  ];
}

// ── The shift bar ───────────────────────────────────────────────────────────

/** Live, or Past scheduled end once the template's end has passed. */
export function liveShiftState(
  shift: Pick<ShiftInput, 'openedAt' | 'scheduledEndTime'>,
  now: number,
  timeZone?: string,
): ShiftStatusState {
  return timeZone && isHandoverDue(shift.openedAt, now, shift.scheduledEndTime, timeZone)
    ? 'shift-past-end'
    : 'shift-live';
}

// ── Everything the Live shift tab shows ─────────────────────────────────────

export interface LiveShiftFigures {
  groups: NozzleGroup[];
  fuel: FuelTotals;
  drawers: DrawerFigures;
  takings: Takings;
  products: ProductSales;
  /** Fuel (metered so far) + Product sales, rupees. */
  sales: number;
  /** The Drawers not handed over yet ("DU2 · Suresh"). */
  pending: NozzleGroup[];
  checklist: CheckItem[];
}

export function liveShiftFigures(input: {
  shift: ShiftInput;
  /** Declared cash sales from the close-shift cash summary. */
  cashDeclared: number;
  before: PreHandoverTotals;
  handoverSales: HandoverProductSaleInput[];
  billed: BilledSaleInput[];
  now: number;
  timeZone?: string;
  formatMoney: (rupees: number) => string;
}): LiveShiftFigures {
  const groups = nozzleGroups(input.shift, { now: input.now, timeZone: input.timeZone });
  const fuel = fuelTotals(groups.flatMap((g) => g.rows));
  const drawers = drawerFigures(input.shift);
  const products = productSales({
    assignments: input.shift.staffAssignments ?? [],
    handoverSales: input.handoverSales,
    billed: input.billed,
  });
  return {
    groups,
    fuel,
    drawers,
    takings: takings(input.shift, input.cashDeclared, input.before),
    products,
    sales: sumRupees([fuel.value, products.total]),
    pending: groups.filter((g) => g.assignment && !g.handover),
    checklist: beforeCloseChecklist(groups, drawers, input.formatMoney),
  };
}

/** The products on the nozzle table, with how many nozzles each, for its filter. */
export function nozzleProducts(
  groups: NozzleGroup[],
): { key: string; label: string; count: number }[] {
  const out = new Map<string, { key: string; label: string; count: number }>();
  for (const r of groups.flatMap((g) => g.rows)) {
    const p = out.get(r.productKey) ?? { key: r.productKey, label: r.product, count: 0 };
    p.count += 1;
    out.set(r.productKey, p);
  }
  return [...out.values()];
}

/** The groups showing only one product's nozzles (`all` keeps every row); empty groups drop out. */
export function filterNozzleGroups(groups: NozzleGroup[], productKey: string): NozzleGroup[] {
  if (productKey === 'all') return groups;
  return groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => r.productKey === productKey) }))
    .filter((g) => g.rows.length > 0);
}

import {
  compareByDispenserThenNozzle,
  compareNatural,
  dispenserLabel,
  handoverState,
  handoverStatus,
  isHandoverDue,
  type HandoverStatusState,
} from '@pump/shared';
import { toPaise } from '../../utils/ledgerWindow.js';
import {
  DRAWER_KEY,
  duText,
  litres3,
  n,
  rupees2,
  type HandoverInput,
  type NozzleReadingInput,
  type ShiftInput,
  type StaffAssignmentInput,
} from './liveShiftInputs.js';

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

/** A Drawer still out: its readings come with its Handover, so its rows are not counted yet. */
export const isPendingGroup = (g: NozzleGroup): boolean => !!g.assignment && !g.handover;

/**
 * The rows the shift's fuel figures count: every handed-over Drawer's, and
 * nozzles on no Drawer (nothing to wait for). A pending Drawer's rows are left
 * out even if its meter has moved, so a total never mixes in half a Drawer.
 */
export const countedRows = (groups: NozzleGroup[]): NozzleRow[] =>
  groups.filter((g) => !isPendingGroup(g)).flatMap((g) => g.rows);

export interface NozzleTotal {
  /** Says what the row leaves out: "Total excl. DU2", "Total of 4 shown". */
  label: string;
  litres: number;
  value: number;
}

/**
 * The nozzle table's total row for the groups shown: the counted rows only,
 * labelled with the pending Drawers it leaves out and, when the table is
 * filtered, how many nozzles are shown.
 */
export function nozzleTotal(shown: NozzleGroup[], filtered: boolean): NozzleTotal {
  const t = fuelTotals(countedRows(shown));
  const count = shown.reduce((s, g) => s + g.rows.length, 0);
  const pending = shown.filter(isPendingGroup).map((g) => g.du);
  const base = filtered ? `Total of ${count} shown` : 'Total';
  return {
    label: pending.length > 0 ? `${base} excl. ${pending.join(', ')}` : base,
    litres: t.byUnit.reduce((s, u) => s + Math.round(u.litres * 1000), 0) / 1000,
    value: t.value,
  };
}

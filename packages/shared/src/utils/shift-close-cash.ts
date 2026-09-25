/**
 * Two-level shift-close cash maths (#287, ADR 0005), shared by the API close
 * use-case and the desktop close wizard preview so both use one formula.
 */

/**
 * Snapshot marker for the two-level variance model (#287). Snapshots without it
 * were closed under the old model, where `cashVariance` already included the
 * attendant shortage; they keep a single "Cash Variance" line.
 */
export const CASH_VARIANCE_MODEL_TWO_LEVEL = 2;

/** True when a Shift Summary snapshot was closed under the two-level model. */
export function isTwoLevelVarianceSnapshot(
  snap: { cashVarianceModel?: unknown } | null | undefined,
) {
  return Number(snap?.cashVarianceModel ?? 0) >= CASH_VARIANCE_MODEL_TWO_LEVEL;
}

/** One key for a Drawer (Attendant + DU); '' is "no drawer". */
export function drawerKey(d: { attendantId?: string | null; duId?: string | null }): string {
  return d.attendantId && d.duId ? `${d.attendantId}|${d.duId}` : '';
}

/** Inverse of drawerKey: '' → no drawer. */
export function parseDrawerKey(key: string): { attendantId: string | null; duId: string | null } {
  const [attendantId, duId] = key ? key.split('|') : [];
  return { attendantId: attendantId || null, duId: duId || null };
}

/** The Drawer fields the close maths reads. */
export interface CloseCashDrawer {
  attendantId: string;
  duId: string;
  expectedCash: number | null;
  variance: number | null;
  closeCashDrops?: number;
}

/** A Cash Drop recorded at close. Naming a Drawer reduces that Drawer's
 *  expected cash; a drop naming no Drawer reduces the office's expected cash. */
export interface CloseCashDrop {
  attendantId?: string | null;
  duId?: string | null;
  amount: number;
}

/** Two-level cash result of a shift close (#287). */
export interface ShiftCloseCash<D extends CloseCashDrawer = CloseCashDrawer> {
  /** Drawers with close drops applied to their variance. */
  drawers: D[];
  /** Σ drawer variance (declared + drops − expected). */
  attendantVariance: number;
  /** Named drops at close (added to cash received). */
  drawerCloseCashDrops: number;
  /** Drops at close naming no Drawer (reduce office expected). */
  unassignedCloseCashDrops: number;
  /** Cash received from sales: posted to the ledger. */
  cashSales: number;
  expectedDrawerCash: number;
  /** Office count variance: counted − expected office cash. */
  cashVariance: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Two-level variance (#287). Attendant variance = Σ (declared + drops −
 * expected) per Drawer; office count variance = counted − Σ declared (less
 * unassigned drops at close). The ledger receives Σ declared cash sales plus
 * named drops at close; attendant shortages are not posted.
 */
export function computeShiftCloseCash<D extends CloseCashDrawer>(
  totals: {
    openingFloat: number;
    cashSales: number;
    handoverCashDrops: number;
    drawers: D[];
  },
  closingCash: number,
  closeDrops: CloseCashDrop[] = [],
  legacyUnassignedDrops = 0,
): ShiftCloseCash<D> {
  const byDrawer = new Map<string, number>();
  let unassigned = legacyUnassignedDrops;
  for (const d of closeDrops) {
    const k = drawerKey(d);
    if (k) {
      byDrawer.set(k, (byDrawer.get(k) ?? 0) + d.amount);
    } else unassigned += d.amount;
  }
  let named = 0;
  const drawers = totals.drawers.map((dr): D => {
    const drop = byDrawer.get(drawerKey(dr)) ?? 0;
    named += drop;
    if (!drop) return { ...dr, closeCashDrops: 0 };
    return {
      ...dr,
      closeCashDrops: drop,
      expectedCash: dr.expectedCash === null ? null : round2(dr.expectedCash - drop),
      variance: dr.variance === null ? null : round2(dr.variance + drop),
    };
  });
  const attendantVariance = round2(drawers.reduce((s, d) => s + (d.variance ?? 0), 0));
  const expectedDrawerCash = round2(
    totals.openingFloat + totals.cashSales - totals.handoverCashDrops - unassigned,
  );
  return {
    drawers,
    attendantVariance,
    drawerCloseCashDrops: round2(named),
    unassignedCloseCashDrops: round2(unassigned),
    cashSales: round2(totals.cashSales + named),
    expectedDrawerCash,
    cashVariance: round2(closingCash - expectedDrawerCash),
  };
}

/** Variances smaller than this (half a paisa) read as balanced. */
export const VARIANCE_EPSILON = 0.005;

/** True when a variance is zero to the paisa. */
export const isBalancedVariance = (v: number) => Math.abs(v) < VARIANCE_EPSILON;

/** The lines of the close-shift cash summary (#307). They add up:
 *  openingFloats + cashDeclared − handoverDrops − unassignedCloseDrops =
 *  expectedOfficeCash. Drops at close that name a Drawer already lower that
 *  Drawer's declared cash, so they are not repeated here. */
export interface ShiftCloseCashSummaryLines {
  openingFloats: number;
  /** Σ cash sales the Drawers declared at Handover (floats excluded). */
  cashDeclared: number;
  handoverDrops: number;
  unassignedCloseDrops: number;
  expectedOfficeCash: number;
}

/** Server shift reconciliation totals the close summary reads. */
export interface CloseCashRecon<D extends CloseCashDrawer = CloseCashDrawer> {
  openingFloat?: number | string | null;
  cashSales?: number | string | null;
  handoverCashDrops?: number | string | null;
  drawers?: D[] | null;
}

export interface CloseCashSummary<D extends CloseCashDrawer = CloseCashDrawer> {
  lines: ShiftCloseCashSummaryLines;
  /** Two-level close maths; null until the server recon loads. */
  closeCash: ShiftCloseCash<D> | null;
}

/**
 * Close-shift cash summary (#307). Opening cash is not stored (ADR 0005): it is
 * Σ Opening Floats, from the server recon or, before it loads, from the
 * shift's staff assignments. Without the recon, the office expects Σ cash
 * handed over (declared cash includes each float), or only the floats before
 * any Handover.
 */
export function buildCloseCashSummary<D extends CloseCashDrawer>(input: {
  recon: CloseCashRecon<D> | null | undefined;
  staffAssignments: { openingFloat?: number | string | null }[];
  closeDrops: CloseCashDrop[];
  closingCash: number;
  /** Fallback only: Σ cash handed over, or null before any Handover. */
  cashHandedOver: number | null;
}): CloseCashSummary<D> {
  const { recon, staffAssignments, closeDrops, closingCash, cashHandedOver } = input;
  if (!recon) {
    const openingFloats = round2(
      staffAssignments.reduce((s, a) => s + Number(a.openingFloat || 0), 0),
    );
    const expected = cashHandedOver === null ? openingFloats : round2(cashHandedOver);
    return {
      closeCash: null,
      lines: {
        openingFloats,
        cashDeclared: round2(expected - openingFloats),
        handoverDrops: 0,
        unassignedCloseDrops: 0,
        expectedOfficeCash: expected,
      },
    };
  }
  const totals = {
    openingFloat: Number(recon.openingFloat || 0),
    cashSales: Number(recon.cashSales || 0),
    handoverCashDrops: Number(recon.handoverCashDrops || 0),
    drawers: Array.isArray(recon.drawers) ? recon.drawers : [],
  };
  const closeCash = computeShiftCloseCash(
    totals,
    closingCash,
    closeDrops.filter((d) => d.amount > 0),
  );
  return {
    closeCash,
    lines: {
      openingFloats: round2(totals.openingFloat),
      cashDeclared: round2(totals.cashSales),
      handoverDrops: round2(totals.handoverCashDrops),
      unassignedCloseDrops: closeCash.unassignedCloseCashDrops,
      expectedOfficeCash: closeCash.expectedDrawerCash,
    },
  };
}

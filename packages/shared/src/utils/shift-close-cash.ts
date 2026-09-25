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

/** The lines of the close-shift cash summary (#307). They add up:
 *  openingFloats + cashDeclared − handoverDrops − unassignedCloseDrops = expected.
 *  Drops at close that name a Drawer already lower that Drawer's declared
 *  cash, so they are not repeated here. */
export interface ShiftCloseCashSummaryLines {
  openingFloats: number;
  /** Σ cash the Drawers declared at Handover (floats included via openingFloats). */
  cashDeclared: number;
  handoverDrops: number;
  unassignedCloseDrops: number;
  expectedOfficeCash: number;
}

export function shiftCloseCashSummaryLines(
  totals: { openingFloat: number; cashSales: number; handoverCashDrops: number },
  closeCash: Pick<ShiftCloseCash, 'unassignedCloseCashDrops' | 'expectedDrawerCash'>,
): ShiftCloseCashSummaryLines {
  return {
    openingFloats: round2(totals.openingFloat),
    cashDeclared: round2(totals.cashSales),
    handoverDrops: round2(totals.handoverCashDrops),
    unassignedCloseDrops: closeCash.unassignedCloseCashDrops,
    expectedOfficeCash: closeCash.expectedDrawerCash,
  };
}

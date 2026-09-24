/**
 * Two-level shift-close cash maths (#287, ADR 0005), shared by the API close
 * use-case and the desktop close wizard preview so both use one formula.
 */

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
    if (d.attendantId && d.duId) {
      const k = `${d.attendantId}|${d.duId}`;
      byDrawer.set(k, (byDrawer.get(k) ?? 0) + d.amount);
    } else unassigned += d.amount;
  }
  let named = 0;
  const drawers = totals.drawers.map((dr): D => {
    const drop = byDrawer.get(`${dr.attendantId}|${dr.duId}`) ?? 0;
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

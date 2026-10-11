/**
 * Drawer reconciliation at Handover (ADR 0005): one formula shared by the API
 * use-case (`record-handover`) and the mobile handover form's live preview, so
 * the figure an attendant sees before saving is the one the server records.
 *
 * The pouch holds the Opening Float plus the Drawer's cash sales, less what was
 * dropped. Cash sales are the expected total (metered fuel + merchandise cash)
 * not settled by card, UPI, credit or OMC card.
 */

export interface DrawerReconciliationInput {
  openingFloat: number;
  /** Σ net litres × unit price over the Drawer's nozzles. */
  expectedFuelSales: number;
  /** Merchandise cash the server attributes to this Handover. */
  merchandiseCash: number;
  cardHandedOver: number;
  upiHandedOver: number;
  /** Fleet fuel-on-credit recorded against this Drawer (a receivable). */
  creditSales: number;
  /** OMC fuel-card sales recorded against this Drawer. */
  omcCardSales: number;
  cashHandedOver: number;
  cashDrops: number;
}

export interface DrawerReconciliation {
  /** Metered fuel + merchandise cash, unrounded. */
  expectedTotal: number;
  /** Card + UPI + credit + OMC card, unrounded. */
  nonCash: number;
  /** Cash + non-cash, unrounded. */
  declaredTotal: number;
  /** Expected total not settled by non-cash, to the paisa. */
  cashSales: number;
  /** What the pouch should hold, to the paisa. */
  expectedCash: number;
  /** Declared cash − expected cash, to the paisa. Negative is short. */
  varianceAmount: number;
}

/** To the paisa; `|| 0` normalises -0. */
const roundPaise = (value: number) => Math.round(value * 100) / 100 || 0;

export function reconcileDrawer(input: DrawerReconciliationInput): DrawerReconciliation {
  const expectedTotal = input.expectedFuelSales + input.merchandiseCash;
  const nonCash =
    input.cardHandedOver + input.upiHandedOver + input.creditSales + input.omcCardSales;
  const declaredTotal = input.cashHandedOver + nonCash;
  const rawExpectedCash = input.openingFloat + expectedTotal - nonCash - input.cashDrops;
  return {
    expectedTotal,
    nonCash,
    declaredTotal,
    cashSales: roundPaise(expectedTotal - nonCash),
    expectedCash: roundPaise(rawExpectedCash),
    varianceAmount: roundPaise(input.cashHandedOver - rawExpectedCash),
  };
}

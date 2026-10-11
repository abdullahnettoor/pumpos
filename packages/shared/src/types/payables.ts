/**
 * Payables summary wire contract (`GET /api/reports/payables`,
 * `GET /api/reports/payables/:supplierId`).
 *
 * What the Organization owes its suppliers, and how long the oldest Purchase has
 * waited. The figures come from the supplier ledger, settled FIFO (CONTEXT.md
 * "Payables"): a Supplier Payment (or a credit Adjustment) settles the OLDEST
 * open payable first. The mobile Money tab renders exactly what the API returns
 * and calculates nothing.
 *
 * There are no due dates: suppliers carry no payment terms in the data, so an
 * unpaid Purchase is aged only by the date it was received.
 */

/** Suppliers the list returns (largest balance first); totals still cover everyone. */
export const PAYABLES_SUPPLIER_LIMIT = 500;
/** Products the supplier page lists under "Purchases by product" (largest value first). */
export const PAYABLES_PRODUCT_LIMIT = 20;

/**
 * One supplier's open payable. The list only carries suppliers that are owed
 * money, so its `balance` is always positive; the single-supplier read carries
 * the NET balance, which is negative when the supplier has been paid ahead (an
 * advance).
 */
export interface SupplierPayable {
  supplierId: string;
  /** Σ purchases − Σ payments, as the suppliers list's `currentBalance`. Negative = advance. */
  balance: number;
  /** Purchases that are not (fully) paid, oldest paid first. */
  unpaidCount: number;
  /** Business Date of the oldest Purchase that is still (partly) unpaid. */
  oldestUnpaidDate: string | null;
  /** Whole days from `oldestUnpaidDate` to the Current Business Date. */
  oldestUnpaidDays: number | null;
}

export interface PayablesMonthFigures {
  /** Purchases received this month (by Business Date). */
  purchased: number;
  /** Supplier Payments made this month (by Entry Date). */
  paid: number;
  /**
   * The calendar months those two figures cover (`YYYY-MM`). They differ for a
   * few hours around a month end: "this month" is the Business Date's month for
   * Purchases but the station calendar date's month for Payments (ADR 0005).
   */
  purchasedMonth: string;
  paidMonth: string;
}

/** `GET /reports/payables?stationId=` */
export interface PayablesSummary {
  /** Σ of every supplier's open payable. */
  total: number;
  /** Suppliers that are owed money. */
  supplierCount: number;
  month: PayablesMonthFigures;
  /** Largest balance first, at most `PAYABLES_SUPPLIER_LIMIT`. */
  suppliers: SupplierPayable[];
}

export interface SupplierLastPayment {
  amount: number;
  /** Entry Date of the Supplier Payment. */
  entryDate: string;
  /** The Funding Account's type, raw ('CASH_IN_HAND', 'BANK', ...); null if the account is unknown. */
  method: string | null;
  fundingAccountName: string | null;
}

export interface SupplierMonthFigures extends PayablesMonthFigures {
  /** Purchases received this month. */
  purchaseCount: number;
  /** Fuel litres received this month (fuel products only, whatever unit text they carry). */
  quantity: number;
}

export interface SupplierProductPurchase {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  /** Σ line totals (tax inclusive). */
  value: number;
}

/** `GET /reports/payables/:supplierId?stationId=` */
export interface SupplierPayableSummary extends SupplierPayable {
  lastPayment: SupplierLastPayment | null;
  month: SupplierMonthFigures;
  /** This month, largest value first, at most `PAYABLES_PRODUCT_LIMIT`. */
  purchasesByProduct: SupplierProductPurchase[];
}

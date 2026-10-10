import type {
  PayablesMonthFigures,
  SupplierLastPayment,
  SupplierMonthFigures,
  SupplierProductPurchase,
} from '@pump/shared';

/**
 * Payables summary: source data ports.
 *
 * The reader settles every supplier's ledger oldest-payable-first IN THE
 * DATABASE (a running sum of debits per supplier against the total credits) and
 * hands core small, already-aggregated rows. Core never sees a ledger and never
 * loops over one: what it does here is bounded by the suppliers returned, not by
 * how many entries they have.
 */

/**
 * Payables are Organization-wide: a supplier and its balance belong to the
 * Organization (like the suppliers list's `currentBalance`), so a query names no
 * Station. The Station only gates access (the route) and supplies the clock.
 */
export interface PayablesQuery {
  organizationId: string;
  /** Purchases of this Business Date range are "this month" (inclusive). */
  purchasedFrom: string;
  purchasedTo: string;
  /** Supplier Payments of this Entry Date range are "this month" (inclusive). */
  paidFrom: string;
  paidTo: string;
}

export interface SupplierPayableQuery extends PayablesQuery {
  supplierId: string;
}

/** One supplier's open payable, as the database settled it. */
export interface PayableSourceRow {
  supplierId: string;
  /** Net balance (Σ purchases − Σ payments): negative when paid ahead. */
  balance: number;
  unpaidCount: number;
  oldestUnpaidDate: string | null;
}

export interface PayablesSource {
  /** Σ of every supplier's open payable, not only the rows returned. */
  total: number;
  /** Suppliers that are owed money, not only the rows returned. */
  supplierCount: number;
  month: PayablesMonthFigures;
  /** Suppliers owed money, largest first, already capped by the reader. */
  suppliers: PayableSourceRow[];
}

export interface SupplierPayableSource {
  payable: PayableSourceRow;
  lastPayment: SupplierLastPayment | null;
  month: SupplierMonthFigures;
  purchasesByProduct: SupplierProductPurchase[];
}

export interface PayablesReader {
  summary(query: PayablesQuery): Promise<PayablesSource>;
  /** Null when the supplier does not exist in the Organization. */
  supplier(query: SupplierPayableQuery): Promise<SupplierPayableSource | null>;
}

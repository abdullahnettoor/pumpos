import { computeRange, type DateRange, type SectionQuery } from '../../pump-ds/index.js';
import type { SupplierPaymentRow } from '../../services/cloud.js';
import { CASH_ACCOUNT_TYPES } from '../../utils/ledgerLabels.js';
import { countOf, inWindow, sumAmounts, type EntryClock } from '../../utils/ledgerWindow.js';
import { balanceOf, purchaseDate, type PurchaseRow, type SupplierRow } from './columns.js';

/**
 * The few Suppliers-page figures the server's payables summary does not carry
 * (#528): advances paid, today's purchases and the payments' account split.
 * Payable, Purchased and Paid for the month come from `/reports/payables`.
 * Pure, so the tiles are tested without a screen.
 */

/** A query result as the Suppliers tabs read it: the Data Section's slice plus its data. */
export interface QueryOf<T> extends SectionQuery {
  data?: T;
}

export const suppliersCount = (n: number) => countOf(n, 'supplier', 'suppliers');

/** The station's "today" for each anchor a purchase can carry. */
export interface PurchaseClock {
  /** Station calendar date: a Fuel Purchase (an Office Record, no business day). */
  entryToday: string;
  /** Business date: a Product Purchase sealed with its day. */
  businessToday: string;
}

/**
 * Whether a purchase falls on today, by its own anchor, as the payables report
 * counts the month: a purchase on a business day by the business today, a Fuel
 * Purchase by the calendar today.
 */
export const isPurchasedToday = (p: PurchaseRow, clock: PurchaseClock) =>
  purchaseDate(p) === (p.businessDayId != null ? clock.businessToday : clock.entryToday);

/** Today's purchases: total and invoice count. */
export function purchasedToday(purchases: readonly PurchaseRow[], clock: PurchaseClock) {
  const rows = purchases.filter((p) => isPurchasedToday(p, clock));
  return { total: sumAmounts(rows), count: rows.length };
}

/** Purchases dated inside a range. An undated purchase falls in no range. */
export const purchasesIn = (purchases: readonly PurchaseRow[], range: DateRange) =>
  purchases.filter((p) => inWindow(purchaseDate(p), range));

/** Money paid ahead to suppliers (Σ negative balances, as a positive amount). */
export function advanceFigures(suppliers: readonly SupplierRow[]) {
  let total = 0;
  let count = 0;
  for (const s of suppliers) {
    const b = balanceOf(s);
    if (b < 0) {
      total -= b;
      count += 1;
    }
  }
  return { total, count };
}

const CASH = new Set<string>(CASH_ACCOUNT_TYPES);

/**
 * The month's Supplier Payments (by Entry Date): total, the cash / other split
 * and the suppliers paid. Read from the month's payments query.
 */
export function paymentFigures(payments: readonly SupplierPaymentRow[], clock: EntryClock) {
  const month = computeRange('this-month', clock);
  const monthRows = payments.filter((p) => inWindow(p.entryDate, month));
  const cash = sumAmounts(monthRows.filter((p) => CASH.has(p.accountType ?? '')));
  const total = sumAmounts(monthRows);
  return {
    monthFrom: month.from,
    month: total,
    monthCount: monthRows.length,
    cash,
    other: Math.round((total - cash) * 100) / 100,
    suppliers: new Set(monthRows.map((p) => p.supplierId)).size,
  };
}

/**
 * Today's Supplier Payments (by Entry Date): amount and count. Read from its
 * own today query, so the Paid today tile fails on its own (#575).
 */
export function paidToday(payments: readonly SupplierPaymentRow[], clock: EntryClock) {
  const today = computeRange('today', clock);
  const rows = payments.filter((p) => inWindow(p.entryDate, today));
  return { amount: sumAmounts(rows), count: rows.length };
}

/** The balance list's row filters. */
export type SupplierFilter = 'all' | 'payable' | 'advance' | 'inactive';

export const SUPPLIER_FILTERS: Record<SupplierFilter, (s: SupplierRow) => boolean> = {
  all: () => true,
  payable: (s) => balanceOf(s) > 0,
  advance: (s) => balanceOf(s) < 0,
  inactive: (s) => !s.isActive,
};

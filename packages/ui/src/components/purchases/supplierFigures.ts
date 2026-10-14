import type { SupplierPaymentRow } from '../../services/cloud.js';
import { CASH_ACCOUNT_TYPES } from '../../utils/ledgerLabels.js';
import { balanceOf, purchaseDate, type PurchaseRow, type SupplierRow } from './columns.js';

/**
 * The Suppliers page's headline figures, worked out from the lists the page
 * already reads (suppliers, purchases, supplier payments). Pure, so the tiles
 * are tested without a screen.
 */

/** The station's "today" for each kind of purchase. */
export interface PurchaseClock {
  /** Station calendar date: the anchor of an Office Record (a Fuel Purchase). */
  entryToday: string;
  /** Business date: the anchor of a Product Purchase sealed with its day. */
  businessToday: string;
}

const amountOf = (r: { amount: number | string | null | undefined }) => Number(r.amount || 0);
const sum = <T extends { amount: number | string | null | undefined }>(rows: readonly T[]) =>
  rows.reduce((s, r) => s + amountOf(r), 0);

/**
 * Purchases today and this month. A purchase dated by Entry Date compares with
 * the calendar today; one dated by its Business Day with the business today,
 * so each lands in the day the operator recorded it in.
 */
export function purchaseFigures(purchases: readonly PurchaseRow[], clock: PurchaseClock) {
  let today = 0;
  let todayCount = 0;
  let month = 0;
  let monthCount = 0;
  for (const p of purchases) {
    const date = purchaseDate(p) ?? '';
    const anchor = p.entryDate ? clock.entryToday : clock.businessToday;
    if (date === anchor) {
      today += amountOf(p);
      todayCount += 1;
    }
    if (date.startsWith(anchor.slice(0, 7))) {
      month += amountOf(p);
      monthCount += 1;
    }
  }
  return { today, todayCount, month, monthCount };
}

/** Supplier Payments today and this month, and this month's split by account. */
export function paymentFigures(payments: readonly SupplierPaymentRow[], entryToday: string) {
  const monthPrefix = entryToday.slice(0, 7);
  const todayRows = payments.filter((p) => p.entryDate === entryToday);
  const monthRows = payments.filter((p) => p.entryDate?.startsWith(monthPrefix));
  const cashMonth = sum(
    monthRows.filter((p) => CASH_ACCOUNT_TYPES.includes(p.accountType as never)),
  );
  const month = sum(monthRows);
  return {
    today: sum(todayRows),
    todayCount: todayRows.length,
    month,
    monthCount: monthRows.length,
    cashMonth,
    otherMonth: month - cashMonth,
  };
}

/**
 * What is owed across suppliers (Payable: Σ positive balances) and what has
 * been paid ahead (Σ advances, as a positive amount). Their difference is the
 * list's net total.
 */
export function balanceFigures(suppliers: readonly SupplierRow[]) {
  let payable = 0;
  let payableCount = 0;
  let advance = 0;
  let advanceCount = 0;
  for (const s of suppliers) {
    const b = balanceOf(s);
    if (b > 0) {
      payable += b;
      payableCount += 1;
    } else if (b < 0) {
      advance -= b;
      advanceCount += 1;
    }
  }
  return { payable, payableCount, advance, advanceCount };
}

/** The balance list's row filters. */
export type SupplierFilter = 'all' | 'payable' | 'advance' | 'inactive';

export const SUPPLIER_FILTERS: Record<SupplierFilter, (s: SupplierRow) => boolean> = {
  all: () => true,
  payable: (s) => balanceOf(s) > 0,
  advance: (s) => balanceOf(s) < 0,
  inactive: (s) => !s.isActive,
};

/** "1 supplier", "3 invoices". */
export const countOf = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

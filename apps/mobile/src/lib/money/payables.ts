/**
 * How the payables summary (`GET /reports/payables`) reads on screen: the
 * "N unpaid · since 9 Oct" caption on a supplier row, the Supplier page's tiles
 * and the purchases-by-product rows. Pure and string-only: every figure
 * (balance, counts, dates, month totals) arrives computed by the API; nothing
 * here derives a business number. What is missing stays missing: `null` in,
 * `null` out, so the screens hide a figure instead of showing a zero for it.
 *
 * There are no due dates: suppliers carry no payment terms, so the only age
 * shown is how long the oldest unpaid Purchase has waited.
 */
import type {
  SupplierLastPayment,
  SupplierMonthFigures,
  SupplierPayable,
  SupplierProductPurchase,
} from '@pump/shared';
import { accountTypeLabel } from '@pump/ui';
import { compactRupees, plural } from '../format.js';
import { daysLabel, type Tile } from './receivables.js';
import { dayLabel } from './statement.js';

/** `1 unpaid`, `2 unpaid`; null when no Purchase waits (an Opening Balance or an advance is not "unpaid"). */
export const unpaidLabel = (
  p: Pick<SupplierPayable, 'unpaidCount'> | null | undefined,
): string | null =>
  p && p.unpaidCount > 0 ? `${p.unpaidCount.toLocaleString('en-IN')} unpaid` : null;

/** `since 9 Oct`: when the oldest unpaid Purchase was received. */
export const sinceLabel = (
  p: Pick<SupplierPayable, 'oldestUnpaidDate'> | null | undefined,
): string | null => (p?.oldestUnpaidDate ? `since ${dayLabel(p.oldestUnpaidDate)}` : null);

/** Everything a supplier row says under its name: the trade name or phone, then how many are unpaid. */
export const supplierRowMeta = (
  base: string,
  p: Pick<SupplierPayable, 'unpaidCount'> | null | undefined,
): string => [base, unpaidLabel(p)].filter(Boolean).join(' · ');

/** `1 unpaid purchase · oldest 9 Oct (today)`; null with nothing unpaid. */
export function oldestUnpaidLine(
  p:
    | Pick<SupplierPayable, 'unpaidCount' | 'oldestUnpaidDate' | 'oldestUnpaidDays'>
    | null
    | undefined,
): string | null {
  if (!p || p.unpaidCount <= 0 || !p.oldestUnpaidDate) return null;
  const count = plural(p.unpaidCount, 'unpaid purchase');
  const age = p.oldestUnpaidDays == null ? '' : ` (${daysLabel(p.oldestUnpaidDays)})`;
  return `${count} · oldest ${dayLabel(p.oldestUnpaidDate)}${age}`;
}

/** `22,000 L` (whole units; litres and nos are never fractional in practice). */
export const quantityLabel = (quantity: number, unit: string): string =>
  `${Math.round(quantity).toLocaleString('en-IN')} ${unit}`.trim();

/** "Purchased this month": the value, then `2 purchases · 22,000 L` (litres only when fuel came in). */
export function purchasedTile(m: SupplierMonthFigures): Tile {
  const litres = Math.round(m.quantity);
  return {
    label: 'Purchased this month',
    value: compactRupees(m.purchased),
    sub: [plural(m.purchaseCount, 'purchase'), litres > 0 ? quantityLabel(litres, 'L') : null]
      .filter(Boolean)
      .join(' · '),
  };
}

/** "Paid this month": the value, then `Last: 6 Oct · Bank` (the last payment ever, not only this month's). */
export function paidThisMonthTile(
  m: Pick<SupplierMonthFigures, 'paid'>,
  last: SupplierLastPayment | null | undefined,
): Tile {
  return {
    label: 'Paid this month',
    value: compactRupees(m.paid),
    sub: last
      ? `Last: ${[dayLabel(last.entryDate), last.method ? accountTypeLabel(last.method) : null]
          .filter(Boolean)
          .join(' · ')}`
      : 'No payment yet',
  };
}

export interface ProductRow {
  productId: string;
  name: string;
  /** `12,000 L`. */
  quantity: string;
  /** `₹10.4L`. */
  value: string;
}

export const productRows = (products: readonly SupplierProductPurchase[]): ProductRow[] =>
  products.map((p) => ({
    productId: p.productId,
    name: p.name,
    quantity: quantityLabel(p.quantity, p.unit),
    value: compactRupees(p.value),
  }));

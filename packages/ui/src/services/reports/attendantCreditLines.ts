import type { AttendantReportShift } from '@pump/shared';
import { formatQty } from '../../utils/format.js';

/**
 * Presentation of a Shift's fuel-on-credit chits, shared by the attendant
 * statement drawer and the exported PDF.
 *
 * The two renderers had drifted apart on all three of the decisions below,
 * which is why this exists rather than each laying its own table out:
 *
 *  - **Whether the section appears at all.** A Shift can carry a credit total
 *    with no chits under it — a back-office entry raised against the Shift
 *    outside any attendant's handover. The PDF printed a placeholder row so
 *    its section still summed to the Shift line; the drawer rendered nothing
 *    and quietly dropped that money out of the breakdown.
 *  - **How a quantity reads.** The PDF printed `12.500 L`, the drawer `12.500`.
 *  - **What stands in for a missing name.** "Unknown customer" and "—" were
 *    written out in both files.
 *
 * Layout still belongs to each renderer — the drawer has room for a product
 * column and a quantity column, the PDF does not — so the row carries both the
 * separate cells AND the folded one. Composing the folded cell here rather
 * than in the PDF is deliberate: doing it there meant re-spelling this
 * module's private "missing" sentinel in another file to branch on, which is
 * the same two-renderers-deciding-independently problem in a worse form.
 *
 * Deliberately free of `@react-pdf/renderer`. The drawer imports this module
 * statically, so reaching for the PDF module's `vol3` would pull the whole PDF
 * engine and its font registration into the Reports page's eager bundle.
 */
export interface CreditChitRow {
  /** Stable React/PDF key. Never collides between a chit and a placeholder. */
  key: string;
  customerName: string;
  vehicle: string;
  product: string;
  /** Formatted with its unit, or '—' when the chit recorded no quantity. */
  quantity: string;
  /**
   * Product and quantity in one cell, for a renderer too narrow for two.
   * '—' when there is no product; the product alone when there is no quantity.
   */
  productWithQuantity: string;
  amount: number;
  /**
   * True for the synthesized row standing in for a Shift that has a credit
   * total but no chits. Renderers may style it as absent data; they must not
   * drop it, or the section stops summing to the Shift line.
   */
  isPlaceholder: boolean;
}

const MISSING = '—';

/**
 * Whether a Shift gets a fuel-on-credit section.
 *
 * `creditSales !== 0` rather than `> 0`: a reversal leaves a negative total,
 * which is still money the breakdown has to account for.
 */
export function shiftShowsCreditBreakdown(shift: AttendantReportShift): boolean {
  return shift.creditSales !== 0 || shift.creditSaleLines.length > 0;
}

/**
 * The rows beneath a Shift's fuel-on-credit heading.
 *
 * Guarantees the property the section is read for: the rows sum to the Shift's
 * credit total, whether or not any chits were recorded against it.
 */
export function creditChitRows(shift: AttendantReportShift): CreditChitRow[] {
  if (!shiftShowsCreditBreakdown(shift)) return [];

  if (shift.creditSaleLines.length === 0) {
    return [
      {
        // Prefixed, so it cannot collide with a transaction id.
        key: `no-chits:${shift.shiftId}`,
        customerName: MISSING,
        vehicle: MISSING,
        product: MISSING,
        quantity: MISSING,
        productWithQuantity: MISSING,
        amount: shift.creditSales,
        isPlaceholder: true,
      },
    ];
  }

  return shift.creditSaleLines.map((line) => {
    const product = line.productName || MISSING;
    // A chit that recorded no quantity is a dash, not a formatted zero. The
    // unit comes off the chit: 'L' for liquids, 'kg' for CNG / Auto-LPG.
    const quantity =
      line.quantity == null ? MISSING : formatQty(line.quantity, 3, line.unit || 'L');
    return {
      key: line.transactionId,
      customerName: line.customerName || 'Unknown customer',
      vehicle: line.vehicleRegistration || MISSING,
      product,
      quantity,
      productWithQuantity:
        line.productName == null || line.productName === ''
          ? MISSING
          : line.quantity == null
            ? product
            : `${product} \u00b7 ${quantity}`,
      amount: line.amount,
      isPlaceholder: false,
    };
  });
}

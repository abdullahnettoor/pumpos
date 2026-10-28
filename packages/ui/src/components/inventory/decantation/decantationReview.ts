import type { DecantationFormValues } from './decantationForm.js';

export interface ReviewLine {
  index: number;
  tankId: string;
  productId: string | undefined;
  beforeDip: number | null;
  afterDip: number | null;
  /** after − before + sales during; null until measured now. */
  received: number | null;
}

export interface ReviewInvoice {
  productId: string;
  invoiceQty: number | null;
  /** Σ received of every tank line of the product; null while any line is pending. */
  received: number | null;
  /** received − invoice: + Excess, − Short. */
  variance: number | null;
  outOfTolerance: boolean;
}

const n = (s: string): number | null => (s.trim() === '' ? null : Number(s));

/** Live read-out of the review step. Informational: the server computes the real variance. */
export function reviewDecantation(
  v: DecantationFormValues,
  tanks: { id: string; productId: string }[],
  invoiceQtyByProduct: Record<string, number | null | undefined>,
  quantityTolerancePct: number,
) {
  const lines: ReviewLine[] = v.lines.map((l, index) => {
    const before = n(l.beforeDip);
    const after = l.doAfterDip ? n(l.afterDip) : null;
    return {
      index,
      tankId: l.tankId,
      productId: tanks.find((t) => t.id === l.tankId)?.productId,
      beforeDip: before,
      afterDip: after,
      received: before != null && after != null ? after - before + (n(l.salesDuring) ?? 0) : null,
    };
  });
  const productIds = [...new Set(lines.map((l) => l.productId))].filter((p): p is string => !!p);
  const invoices: ReviewInvoice[] = productIds
    .filter((p) => !!v.links[p])
    .map((productId) => {
      const mine = lines.filter((l) => l.productId === productId);
      const pending = mine.some((l) => l.received == null);
      const received = pending ? null : mine.reduce((a, l) => a + (l.received ?? 0), 0);
      const invoiceQty = invoiceQtyByProduct[productId] ?? null;
      const variance = received != null && invoiceQty != null ? received - invoiceQty : null;
      return {
        productId,
        invoiceQty,
        received,
        variance,
        outOfTolerance:
          variance != null && invoiceQty != null
            ? Math.abs(variance) > (invoiceQty * quantityTolerancePct) / 100
            : false,
      };
    });
  return {
    lines,
    invoices,
    unlinkedProductIds: productIds.filter((p) => !v.links[p]),
  };
}

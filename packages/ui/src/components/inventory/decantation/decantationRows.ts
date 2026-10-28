/** Display model of one list row: one tanker visit with its tank lines grouped (ADR 0007). */
import {
  decantationVarianceState,
  densityDeviation,
  roundDensity,
  type DecantationVarianceState,
  type DecantationView,
} from '@pump/shared';

export interface DecantationNames {
  tanks: Record<string, string>;
  products: Record<string, string>;
}

export interface DecantationRow {
  decantation: DecantationView;
  tanks: {
    lineId: string;
    tankName: string;
    productName: string;
    beforeDip: number;
    receivedQty: number | null;
    status: 'PENDING_MEASUREMENT' | 'MEASURED';
  }[];
  productNames: string[];
  invoiceQty: number | null;
  /** Σ received, only once every line is measured. */
  receivedQty: number | null;
  /** Received − invoiced per linked product, read against the station tolerance. */
  variances: {
    productName: string;
    state: DecantationVarianceState;
    /** Signed litres: − short, + excess. */
    qty: number;
  }[];
  density: {
    productName: string;
    diff: number;
    invoiceDensity: number;
    roDensity: number;
    /** The server's DENSITY_OUT_OF_TOLERANCE flag on any line of this product. */
    outOfTolerance: boolean;
  }[];
  /** Names of products whose Fuel Purchase is not linked yet. */
  unlinked: string[];
}

export function toDecantationRow(
  d: DecantationView,
  names: DecantationNames,
  quantityTolerancePct: number,
): DecantationRow {
  const productName = (id: string) => names.products[id] ?? 'Fuel';
  const productIds = [...new Set(d.lines.map((l) => l.productId))];
  const links = d.links ?? [];
  const allMeasured = d.lines.length > 0 && d.lines.every((l) => l.status === 'MEASURED');
  const unlinkedIds =
    d.unlinkedProductIds ?? productIds.filter((p) => !links.some((l) => l.productId === p));

  const variances = links
    .filter((l) => l.varianceQty != null)
    .map((l) => ({
      productName: productName(l.productId),
      state: decantationVarianceState(l.varianceQty as number, l.invoiceQty, quantityTolerancePct),
      qty: l.varianceQty as number,
    }));

  const flaggedLineIds = new Set(
    d.flags.filter((f) => f.code === 'DENSITY_OUT_OF_TOLERANCE').map((f) => f.tankLineId),
  );
  const density = links.flatMap((l) => {
    const mine = d.lines.filter((x) => x.productId === l.productId && x.roDensity != null);
    if (l.invoiceDensity == null || mine.length === 0) return [];
    const ro = mine.reduce((a, x) => a + (x.roDensity as number), 0) / mine.length;
    return [
      {
        productName: productName(l.productId),
        diff: roundDensity(densityDeviation(ro, l.invoiceDensity), 1),
        invoiceDensity: l.invoiceDensity,
        roDensity: roundDensity(ro, 1),
        outOfTolerance: mine.some((x) => flaggedLineIds.has(x.id)),
      },
    ];
  });

  return {
    decantation: d,
    tanks: d.lines.map((l) => ({
      lineId: l.id,
      tankName: names.tanks[l.tankId] ?? 'Tank',
      productName: productName(l.productId),
      beforeDip: l.beforeDip,
      receivedQty: l.receivedQty,
      status: l.status,
    })),
    productNames: productIds.map(productName),
    invoiceQty: links.length ? links.reduce((a, l) => a + (l.invoiceQty ?? 0), 0) : null,
    receivedQty: allMeasured ? d.lines.reduce((a, l) => a + (l.receivedQty ?? 0), 0) : null,
    variances,
    density,
    unlinked: unlinkedIds.map(productName),
  };
}

/** The Decantations ledger's closing row: what it sums and what it leaves out. */
export interface DecantationTotal {
  label: string;
  invoiceQty: number;
  receivedQty: number;
}

/**
 * Invoice and received litres over the same thing: each product line that has
 * both a linked invoice and a measured receipt (a link with both figures).
 * Pending measurement and products with no linked purchase are left out of
 * BOTH columns, and the label names whichever of them the rows hold.
 */
export function decantationTotal(rows: readonly DecantationRow[]): DecantationTotal {
  let invoiceQty = 0;
  let receivedQty = 0;
  let pending = false;
  let unlinked = false;
  for (const r of rows) {
    if (r.unlinked.length > 0) unlinked = true;
    for (const l of r.decantation.links ?? []) {
      if (l.invoiceQty != null && l.receivedQty != null) {
        invoiceQty += l.invoiceQty;
        receivedQty += l.receivedQty;
      } else pending = true;
    }
    if (r.decantation.lines.some((l) => l.status !== 'MEASURED')) pending = true;
  }
  const out = [pending && 'pending', unlinked && 'unlinked'].filter(Boolean);
  return {
    label: out.length ? `Total excl. ${out.join(' and ')}` : 'Total',
    invoiceQty,
    receivedQty,
  };
}

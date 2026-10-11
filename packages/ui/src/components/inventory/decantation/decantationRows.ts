/** Display model of one list row: one tanker visit with its tank lines grouped (ADR 0007). */
import { densityDeviation, roundDensity, type DecantationView } from '@pump/shared';

export interface DecantationNames {
  tanks: Record<string, string>;
  products: Record<string, string>;
}

type VarianceKind = 'EXCESS' | 'SHORT' | 'OK';

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
  variances: {
    productName: string;
    kind: VarianceKind;
    qty: number;
    outOfTolerance: boolean;
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
    .map((l) => {
      const v = l.varianceQty as number;
      const kind: VarianceKind = v > 0 ? 'EXCESS' : v < 0 ? 'SHORT' : 'OK';
      const limit = ((l.invoiceQty ?? 0) * quantityTolerancePct) / 100;
      return {
        productName: productName(l.productId),
        kind,
        qty: Math.abs(v),
        outOfTolerance: Math.abs(v) > limit,
      };
    });

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

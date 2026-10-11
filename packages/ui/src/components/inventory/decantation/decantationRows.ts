/** Display model of one list row: one tanker visit with its tank lines grouped (ADR 0007). */
import type { DecantationView } from '@pump/shared';

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
  density: { productName: string; diff: number; invoiceDensity: number; roDensity: number }[];
  /** Names of products whose Fuel Purchase is not linked yet. */
  unlinked: string[];
}

const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

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

  const density = links.flatMap((l) => {
    const ros = d.lines
      .filter((x) => x.productId === l.productId && x.roDensity != null)
      .map((x) => x.roDensity as number);
    if (l.invoiceDensity == null || ros.length === 0) return [];
    const ro = ros.reduce((a, b) => a + b, 0) / ros.length;
    return [
      {
        productName: productName(l.productId),
        diff: round1(ro - l.invoiceDensity),
        invoiceDensity: l.invoiceDensity,
        roDensity: round1(ro),
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

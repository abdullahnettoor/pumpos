/**
 * The figures behind the "Sales by product" card: totals, unit counts, the
 * stacked bar's segments and the row labels. Pure, so every screen that shows
 * the card (Home, Shift Summary, DSSR) gets the same arithmetic.
 */
import { plural } from './format.js';
import { round2 } from './num.js';
import type { FuelLine, ProductLine } from './sales.js';

/** A segment never renders thinner than this share of the bar, so a tiny product stays visible. */
export const MIN_SEGMENT_SHARE = 0.012;

const sumValues = (xs: readonly { value: number }[]) => xs.reduce((s, x) => s + x.value, 0);

export interface BarSegment {
  key: string;
  kind: 'fuel' | 'products';
  /** Position in the full fuel list, so the bar and the rows share a swatch colour. */
  index: number;
  /** Relative flex weight. */
  weight: number;
}

export interface ByProductFigures {
  fuelTotal: number;
  productsTotal: number;
  total: number;
  /** Units across the product lines. */
  units: number;
  segments: BarSegment[];
}

interface Input {
  fuel: readonly FuelLine[];
  products: readonly ProductLine[];
  /** Override a group's total when it is known more exactly than its line sum. */
  fuelTotal?: number;
  productsTotal?: number;
}

export function deriveByProduct(input: Input): ByProductFigures {
  const fuelTotal = input.fuelTotal ?? sumValues(input.fuel);
  const productsTotal = input.productsTotal ?? sumValues(input.products);
  const total = fuelTotal + productsTotal;
  const segments: BarSegment[] = [];
  if (total > 0) {
    input.fuel.forEach((f, index) => {
      if (f.value > 0) segments.push({ key: f.key, kind: 'fuel', index, weight: f.value });
    });
    if (productsTotal > 0)
      segments.push({
        key: 'products',
        kind: 'products',
        index: -1,
        weight: Math.max(productsTotal, total * MIN_SEGMENT_SHARE),
      });
  }
  return {
    fuelTotal,
    productsTotal,
    total,
    units: input.products.reduce((s, p) => s + p.quantity, 0),
    segments,
  };
}

/** "12 units", "1.5 units". */
export const unitsLabel = (n: number): string => plural(round2(n), 'unit');

/** "1,240 L" for a fuel grade. */
export const fuelQuantityLabel = (f: Pick<FuelLine, 'quantity' | 'unit'>): string =>
  `${Math.round(f.quantity).toLocaleString('en-IN')} ${f.unit}`;

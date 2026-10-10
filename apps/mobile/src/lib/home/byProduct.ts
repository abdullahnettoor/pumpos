/**
 * The figures behind the "Sales by product" card: totals, unit counts, the
 * stacked bar's segments and the row labels. Pure, so every screen that shows
 * the card (Home, Shift Summary, DSSR) gets the same arithmetic.
 */
import { PRODUCT_CATEGORY_LABEL, type ProductType } from '@pump/shared';
import { plural } from '../format.js';
import { wholeQuantityLabel } from '../money/quantity.js';
import { round2 } from '../num.js';
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
  wholeQuantityLabel(f.quantity, f.unit);

/** One row of the non-fuel group: a product category, or the single "Products" fallback. */
export interface CategoryRow {
  key: string;
  name: string;
  /** Units across the category's products. */
  quantity: number;
  value: number;
}

/** What a snapshot frozen before categories existed is shown as. */
const UNCATEGORISED_NAME = 'Products';

/**
 * Product lines grouped by category, largest value first with Other last. A
 * line whose snapshot recorded no category lands in Other when its siblings do
 * have one; when NO line has a category (a snapshot frozen before #392) the
 * whole group is one "Products" row, since nothing says what they are. A
 * product typed FUEL that was sold as a Product Sale is not a fuel grade, so it
 * folds into Other rather than showing a "Fuel" row under Lubes & others.
 */
export function groupByCategory(lines: readonly ProductLine[]): CategoryRow[] {
  if (lines.length === 0) return [];
  if (lines.every((l) => l.productType === null))
    return [
      {
        key: 'products',
        name: UNCATEGORISED_NAME,
        quantity: lines.reduce((s, l) => s + l.quantity, 0),
        value: sumValues(lines),
      },
    ];
  const rows = new Map<string, CategoryRow>();
  for (const l of lines) {
    const cat: ProductType = !l.productType || l.productType === 'FUEL' ? 'OTHER' : l.productType;
    const row = rows.get(cat) ?? {
      key: cat,
      name: PRODUCT_CATEGORY_LABEL[cat],
      quantity: 0,
      value: 0,
    };
    row.quantity += l.quantity;
    row.value += l.value;
    rows.set(cat, row);
  }
  const rank = (r: CategoryRow) => (r.key === 'OTHER' ? 1 : 0);
  return [...rows.values()].sort((a, b) => rank(a) - rank(b) || b.value - a.value);
}

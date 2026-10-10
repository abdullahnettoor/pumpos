/**
 * How a quantity reads on a Money screen. Two shapes, named for what they show:
 *
 *  - `wholeQuantityLabel`: a summary figure (`22,000 L`), rounded to whole units.
 *  - `ledgerQuantityLabel`: a statement row's own quantity (`2.5 L Diesel`),
 *    keeping up to two decimals, optionally naming the product.
 *
 * Both write the unit through `unitLabel`, so a unit typed as `Ltr`, `litres` or
 * `L` reads the same everywhere.
 */
import { unitLabel } from '@pump/ui';

// A statement row's own quantity (`2.5 L Diesel`) is shared with the statement PDF: it lives in `@pump/ui`.
export { ledgerQuantityLabel } from '@pump/ui';
export type { LedgerQuantity } from '@pump/ui';

/** The unit as shown: `L` for any litre spelling; blank stays blank. */
const shownUnit = (unit: string | null | undefined): string => {
  const u = unit?.trim();
  return u ? unitLabel(u) : '';
};

/** `22,000 L` (whole units; litres and nos are never fractional in practice). */
export const wholeQuantityLabel = (quantity: number, unit: string): string =>
  `${Math.round(quantity).toLocaleString('en-IN')} ${shownUnit(unit)}`.trim();

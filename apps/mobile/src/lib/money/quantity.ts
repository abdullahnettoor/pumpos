/**
 * How a summary quantity reads on a Money screen (`22,000 L`), rounded to whole
 * units. The unit is written through `unitLabel`, so a unit typed as `Ltr`,
 * `litres` or `L` reads the same everywhere. A statement row's own quantity
 * (`2.5 L Diesel`) is `ledgerQuantityLabel` in `@pump/ui`, shared with the PDF.
 */
import { unitLabel } from '@pump/ui';

/** The unit as shown: `L` for any litre spelling; blank stays blank. */
const shownUnit = (unit: string | null | undefined): string => {
  const u = unit?.trim();
  return u ? unitLabel(u) : '';
};

/** `22,000 L` (whole units; litres and nos are never fractional in practice). */
export const wholeQuantityLabel = (quantity: number, unit: string): string =>
  `${Math.round(quantity).toLocaleString('en-IN')} ${shownUnit(unit)}`.trim();

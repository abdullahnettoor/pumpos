/**
 * Pricing › Fuels (#537): one row per fuel, built from the current prices and
 * the price history. Pure, so the figures are tested here, never in the screen.
 */

export interface CurrentFuelPrice {
  productId: string;
  productName: string;
  productCode?: string | null;
  /** 0 when no price has ever been recorded (the API's convention). */
  price: number | string;
  effectiveFrom: string | null;
}

export interface FuelPriceHistoryEntry {
  id: string;
  productId: string;
  price: number | string;
  effectiveFrom: string;
}

export interface FuelPriceRow {
  productId: string;
  productName: string;
  productCode: string | null;
  /** Sales unit (`L`, `kg`). */
  unit: string;
  /** `null` while no price has been recorded. */
  price: number | null;
  effectiveFrom: string | null;
  /** The change into the current price; `null` when there was only one price. */
  lastChange: { from: number; to: number } | null;
}

const time = (iso: string): number => new Date(iso).getTime();

/** The fuel rows, in the order the API lists the fuels. */
export function buildFuelPriceRows(
  current: CurrentFuelPrice[],
  history: FuelPriceHistoryEntry[],
  unitOf: (productId: string) => string | null | undefined,
): FuelPriceRow[] {
  return current.map((cp) => {
    const entries = history
      .filter((h) => h.productId === cp.productId)
      .sort((a, b) => time(b.effectiveFrom) - time(a.effectiveFrom));
    const hasPrice = cp.effectiveFrom != null;
    const [latest, previous] = entries;
    return {
      productId: cp.productId,
      productName: cp.productName,
      productCode: cp.productCode ?? null,
      unit: unitOf(cp.productId) || 'L',
      price: hasPrice ? Number(cp.price) : null,
      effectiveFrom: cp.effectiveFrom,
      lastChange:
        latest && previous ? { from: Number(previous.price), to: Number(latest.price) } : null,
    };
  });
}

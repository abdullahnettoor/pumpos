import { z } from 'zod';

/**
 * Quantities (litres, kg, counted items) are recorded to 3 decimals, so a
 * quantity variance smaller than half that step (half a millilitre) is float
 * noise and reads as balanced. The quantity twin of `VARIANCE_EPSILON` (money,
 * half a paisa).
 */
export const QUANTITY_EPSILON = 0.0005;

/**
 * True when a quantity variance is zero to the recorded step (3 decimals). The
 * one balanced rule for stock: a stock count, a DSSR stock line and a
 * Decantation's received − invoiced all read balanced by it, on the server
 * and on screen. Money uses `isBalancedVariance`.
 */
export const isBalancedQuantity = (q: number) => Math.abs(q) < QUANTITY_EPSILON;

/**
 * A tank's dip variance (actual dip - book) counts as within tolerance up to
 * this share of the litres it sold. Loss and gain are judged alike by size: an
 * unexplained gain points at a missed Purchase or a bad dip as much as a loss
 * points at shrinkage.
 *
 * The single rule shared by the DSSR page (#395) and the Insights stock-loss
 * block (#402).
 *
 * Default when the Station's tank variance limit is not configured.
 */
export const STOCK_VARIANCE_TOLERANCE_PCT = 0.5;
export const STOCK_VARIANCE_TOLERANCE_KEY = 'stock_variance_tolerance_pct';

export const stockVarianceTolerancePctSchema = z
  .number({ invalid_type_error: 'Enter a number' })
  .finite()
  .min(0, 'Must be 0% or more')
  .max(5, 'Must be 5% or less')
  .refine((value) => Math.round(value * 100) / 100 === value, 'Use at most 2 decimals');

/** Read the Station limit, using the default for absent or invalid settings. */
export function resolveStockVarianceTolerance(settings: unknown): number {
  const value =
    settings && typeof settings === 'object'
      ? (settings as Record<string, unknown>)[STOCK_VARIANCE_TOLERANCE_KEY]
      : undefined;
  const parsed = stockVarianceTolerancePctSchema.safeParse(value);
  return parsed.success ? parsed.data : STOCK_VARIANCE_TOLERANCE_PCT;
}

/** Compare raw settings values so invalid changes are still validated. */
export function stockVarianceToleranceChanged(before: unknown, after: unknown): boolean {
  return !Object.is(
    before === undefined ? STOCK_VARIANCE_TOLERANCE_PCT : before,
    after === undefined ? STOCK_VARIANCE_TOLERANCE_PCT : after,
  );
}

/**
 * Whether a tank's dip variance (signed, dip - book) is inside tolerance.
 * Judged on the SIZE of the variance against litres sold, so a tank that sold
 * nothing (or whose sales are unknown, `null`) is within tolerance only with a
 * balanced variance (`isBalancedQuantity`).
 */
export function isStockVarianceWithinTolerance(
  varianceLitres: number,
  soldLitres: number | null,
  tolerancePct = STOCK_VARIANCE_TOLERANCE_PCT,
): boolean {
  if (isBalancedQuantity(varianceLitres)) return true;
  const allowed = (Math.max(soldLitres ?? 0, 0) * tolerancePct) / 100;
  return Math.abs(varianceLitres) <= allowed + 1e-9;
}

/** The frozen limit only when the snapshot carries a valid value. */
export function frozenStockTolerancePct(snap: unknown): number | null {
  const value =
    snap && typeof snap === 'object'
      ? (snap as Record<string, unknown>).stockVarianceTolerancePct
      : undefined;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** The applied DSR limit, or the historic default for older snapshots. */
export function snapshotStockTolerancePct(snap: unknown): number {
  return frozenStockTolerancePct(snap) ?? STOCK_VARIANCE_TOLERANCE_PCT;
}

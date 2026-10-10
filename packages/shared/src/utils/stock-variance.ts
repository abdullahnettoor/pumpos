/**
 * A tank's dip variance (actual dip - book) counts as within tolerance up to
 * this share of the litres it sold. Loss and gain are judged alike by size: an
 * unexplained gain points at a missed Purchase or a bad dip as much as a loss
 * points at shrinkage. A Station default for now, not configurable per Station.
 *
 * #402's Insights stock-loss block uses the same 0.5% rule
 * (`STOCK_LOSS_TOLERANCE_PCT`); once both are on one branch they should share a
 * single constant.
 */
export const STOCK_VARIANCE_TOLERANCE_PCT = 0.5;

/**
 * Whether a tank's dip variance is inside tolerance. Judged on the SIZE of the
 * variance against litres sold, so a tank that sold nothing (or whose sales are
 * unknown, `null`) is within tolerance only with no variance at all.
 */
export function isStockVarianceWithinTolerance(
  varianceLitres: number,
  soldLitres: number | null,
): boolean {
  const allowed = (Math.max(soldLitres ?? 0, 0) * STOCK_VARIANCE_TOLERANCE_PCT) / 100;
  return Math.abs(varianceLitres) <= allowed + 1e-9;
}

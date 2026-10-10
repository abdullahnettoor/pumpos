/**
 * A tank's dip variance (actual dip - book) counts as within tolerance up to
 * this share of the litres it sold. Loss and gain are judged alike by size: an
 * unexplained gain points at a missed Purchase or a bad dip as much as a loss
 * points at shrinkage.
 *
 * The single rule shared by the DSSR page (#395) and the Insights stock-loss
 * block (#402).
 *
 * NEEDS OWNER DECISION. The repository defines no stock-variance tolerance
 * (CONTEXT.md, the ADRs, `record-stock-count` and the DSSR all report variance
 * as a raw figure), so 0.5% of litres sold is a provisional default. It is one
 * constant so that confirming or changing it is a one-line edit, and it is a
 * Station default, not configurable per Station.
 */
export const STOCK_VARIANCE_TOLERANCE_PCT = 0.5;

/**
 * Whether a tank's dip variance (signed, dip - book) is inside tolerance.
 * Judged on the SIZE of the variance against litres sold, so a tank that sold
 * nothing (or whose sales are unknown, `null`) is within tolerance only with no
 * variance at all.
 */
export function isStockVarianceWithinTolerance(
  varianceLitres: number,
  soldLitres: number | null,
): boolean {
  const allowed = (Math.max(soldLitres ?? 0, 0) * STOCK_VARIANCE_TOLERANCE_PCT) / 100;
  return Math.abs(varianceLitres) <= allowed + 1e-9;
}

/**
 * Stock-variance tolerance: when a tank's recorded Tank Dip variance is small
 * enough, against what the tank sold, to be read as measurement noise rather
 * than a loss.
 *
 * NEEDS OWNER DECISION. The repository defines no stock-variance tolerance
 * (CONTEXT.md, the ADRs, `record-stock-count` and the DSSR all report variance
 * as a raw figure), so 0.5% of litres sold is a provisional default chosen for
 * the Insights stock-loss block. It is one constant here so that confirming or
 * changing it is a one-line edit, and it is not configurable per Station.
 */
export const STOCK_VARIANCE_TOLERANCE_PCT = 0.5;

/**
 * Whether `varianceLitres` (signed, dip − book) is within the tolerance for a
 * tank that sold `soldLitres`. Judged on the SIZE of the variance: an
 * unexplained gain points at a missed Purchase or a bad dip as much as a loss
 * points at shrinkage. A tank that sold nothing is within tolerance only with
 * no variance at all.
 */
export function isStockVarianceWithinTolerance(
  varianceLitres: number,
  soldLitres: number,
  tolerancePct: number = STOCK_VARIANCE_TOLERANCE_PCT,
): boolean {
  const allowed = (Math.max(soldLitres, 0) * tolerancePct) / 100;
  return Math.abs(varianceLitres) <= allowed + 1e-9;
}

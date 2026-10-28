/**
 * Home's sales figures, derived from a DSSR payload (the open day's live preview
 * or a closed day's snapshot). Pure: no React, no fetching.
 *
 * Domain rule (ADR 0005): fuel sales count CLOSED Shifts only (they come from
 * Shift Summaries; a running Shift's fuel is "counted at close"), while Product
 * Sales are live and include the open Shift.
 *
 * Moved to @pump/shared so the desktop Dashboard Money column reuses the exact
 * same domain rule (#506). Re-exported here for mobile backward compatibility.
 */
export {
  type Snapshot,
  readSnapshot,
  type FuelLine,
  type ProductLine,
  type ClosedShift,
  type SalesFigures,
  shiftLabel,
  deriveSales,
  type SplitSegment,
  deriveSplitBar,
  type Comparison,
  deriveComparison,
  type TrendPoint,
  deriveTrend,
  sparklinePath,
  trendWindow,
  type ComparisonView,
  comparisonView,
  unitLabel,
  wholeQuantityLabel,
  businessWeekday,
} from '@pump/shared';

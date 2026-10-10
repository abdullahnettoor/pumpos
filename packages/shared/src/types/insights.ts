/**
 * Insights — sales block wire contract (`GET /api/reports/insights/sales`).
 *
 * Every figure is read from SEALED data: DSSR snapshots of closed Business Days
 * and the Shift Summaries of their Shifts. Composition lives in core; the shape
 * is shared because the mobile Insights tab renders exactly what the API
 * returns and calculates nothing itself.
 */

/** Range lengths the Insights tab offers, in Business Days. */
export const INSIGHTS_RANGE_DAYS = [7, 30, 90] as const;
export type InsightsRangeDays = (typeof INSIGHTS_RANGE_DAYS)[number];

/** Closed Business Days each period needs before the tab compares it with the other. */
export const INSIGHTS_MIN_COMPARABLE_DAYS = 3;

export interface InsightsDateRange {
  /** First Business Date of the period (inclusive, `YYYY-MM-DD`). */
  from: string;
  /** Last Business Date of the period (inclusive, `YYYY-MM-DD`). */
  to: string;
}

/** One calendar day of the sales trend. */
export interface InsightsTrendDay {
  date: string;
  /** Fuel + product sales of the closed day; 0 when the day is not closed. */
  sales: number;
  /** Net fuel volume of the closed day; 0 when the day is not closed. */
  volume: number;
  /** False for a date with no closed Business Day (station closed, or still open). */
  closed: boolean;
}

/** One fuel grade's share of the period's litres. */
export interface InsightsProductMixLine {
  productCode: string;
  litres: number;
  /** Percent of the period's litres (0-100, one decimal). */
  share: number;
}

/** Fuel sold in a unit other than litres (CNG / Auto-LPG in kg): shown beside the mix, never in its shares. */
export interface InsightsOtherUnitFuel {
  productCode: string;
  quantity: number;
  unit: string;
}

export interface InsightsOtherProducts {
  /** Lubes & others (product) sales over the period. */
  total: number;
  previousTotal: number;
  /**
   * Percent change of the per-closed-day average vs the previous period; null
   * when the two periods are not comparable (see `changePct` of `InsightsSales`).
   */
  changePct: number | null;
  /** Best seller by revenue over the period (`quantity` is its unit count). */
  top: { name: string; quantity: number; revenue: number } | null;
}

/** Average per Shift of one Shift Template over the period. */
export interface InsightsShiftTemplate {
  /** Null for a Shift that was opened without a template. */
  templateId: string | null;
  name: string;
  shifts: number;
  /** Fuel sales value from the Shift Summary (product sales are not Shift-summarised). */
  avgSales: number;
  avgVolume: number;
  /** Signed office count variance: negative = short. */
  avgCashVariance: number;
}

export interface InsightsSales {
  /** Null when the Station has no closed Business Day yet. */
  range: InsightsDateRange | null;
  previousRange: InsightsDateRange | null;
  /** Closed Business Days found in the range / in the previous range. */
  closedDays: number;
  previousClosedDays: number;
  total: number;
  previousTotal: number;
  /**
   * Percent change of the AVERAGE PER CLOSED DAY vs the previous period, so a
   * period with fewer closed days is not compared on raw totals. Null (no
   * badge) unless BOTH periods have at least `INSIGHTS_MIN_COMPARABLE_DAYS`
   * closed days: a 2-day sample against a 7-day one says nothing.
   */
  changePct: number | null;
  /** Average per CLOSED day (days the station did not trade do not dilute it). */
  average: number;
  /** The previous period's average per closed day: the basis of `changePct`. */
  previousAverage: number;
  best: { date: string; sales: number } | null;
  trend: InsightsTrendDay[];
  productMix: InsightsProductMixLine[];
  /** Fuel metered in other units than litres: noted beside the mix. */
  otherUnitFuels: InsightsOtherUnitFuel[];
  otherProducts: InsightsOtherProducts;
  shiftTemplates: InsightsShiftTemplate[];
}

/**
 * Insights part 2 (#402): cash variance by attendant, stock loss, credit health.
 * Same `days` range and the same range end as the sales block
 * (`GET /api/reports/insights/{attendant-variance,stock-loss,credit-health}`).
 */

/**
 * One Attendant's cash variance over the range: the ATTENDANT level of the
 * two-level drawer variance (ADR 0005), from the Drawers in closed Shift
 * Summaries. Never summed with the office count variance.
 */
export interface InsightsAttendantVariance {
  attendantId: string;
  name: string;
  /** Closed Shifts in which the Attendant handed over at least one Drawer. */
  shifts: number;
  /** Shifts whose summed Drawer variance was short (negative, not balanced). */
  shortShifts: number;
  /** Shifts whose summed Drawer variance was over (positive, not balanced). */
  overShifts: number;
  /** Signed net over the range: negative = short. */
  netVariance: number;
}

/**
 * A tank's recorded stock variance (Tank Dip vs book) over the range counts as
 * within tolerance up to this share of the litres it sold. Loss and gain are
 * judged alike by size: an unexplained gain points at a missed Purchase or a
 * bad dip as much as a loss points at shrinkage. A station default for now;
 * it is not configurable per Station.
 */
export const STOCK_LOSS_TOLERANCE_PCT = 0.5;

/** One tank's Tank Dip variance over the range. */
export interface InsightsStockLoss {
  tankId: string;
  tankName: string;
  productCode: string;
  /** Σ (actual dip − book) litres. Negative = loss, positive = gain. */
  varianceLitres: number;
  /** Net litres the tank dispensed over the range (Nozzle readings of closed days). */
  soldLitres: number;
  /** `varianceLitres` as a percent of `soldLitres` (signed, two decimals); null when nothing was sold. */
  pctOfSold: number | null;
  /** `varianceLitres` × the product's cost basis (signed: negative = money lost). */
  valueAtCost: number;
  /** |variance| is at most `STOCK_LOSS_TOLERANCE_PCT` of the litres sold. */
  withinTolerance: boolean;
}

/**
 * Credit health over the range. Credit Sales are placed by Business Date
 * (closed days of the range) and Collections by Entry Date, so the two share a
 * calendar window but not an anchor.
 */
export interface InsightsCreditHealth {
  range: InsightsDateRange | null;
  /** Credit Sales (receivables created) on closed Business Days of the range. */
  creditGiven: number;
  /** Collections whose Entry Date falls in the range. */
  collected: number;
  /** `creditGiven − collected`: how much the receivables book moved. Positive = grew. */
  receivablesChange: number;
  /** Credit Sales as a percent of fuel + product sales (one decimal); null with no sales. */
  creditShareOfSales: number | null;
  closedDays: number;
  previousCreditGiven: number;
  /**
   * Per-closed-day average of `creditGiven` vs the previous period; null unless
   * BOTH periods have at least `INSIGHTS_MIN_COMPARABLE_DAYS` closed days.
   */
  creditGivenChangePct: number | null;
}

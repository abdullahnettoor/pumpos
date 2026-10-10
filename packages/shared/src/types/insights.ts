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

export interface InsightsOtherProducts {
  /** Lubes & others (product) sales over the period. */
  total: number;
  previousTotal: number;
  /** Percent change vs the previous period; null when there is nothing to compare. */
  changePct: number | null;
  top: { name: string; quantity: number } | null;
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
  /** Percent change vs the previous period; null when there is nothing to compare. */
  changePct: number | null;
  /** Average per CLOSED day (days the station did not trade do not dilute it). */
  average: number;
  best: { date: string; sales: number } | null;
  trend: InsightsTrendDay[];
  productMix: InsightsProductMixLine[];
  otherProducts: InsightsOtherProducts;
  shiftTemplates: InsightsShiftTemplate[];
}

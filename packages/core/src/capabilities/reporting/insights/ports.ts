import type { InsightsDateRange, InsightsRangeDays } from '@pump/shared';

/**
 * Insights (sales block) — source data ports.
 *
 * The reader aggregates SEALED data in the database (DSSR snapshots of closed
 * Business Days, Shift Summaries of their Shifts) and hands core a small,
 * bounded source: one row per closed day of the range, a handful of product and
 * template rows, and period totals. Core turns it into the contract; it never
 * sees a snapshot's JSON or a whole history.
 */

/** What every Insights reader takes: the tenant, the Station and the range length. */
export interface InsightsRangeQuery {
  organizationId: string;
  stationId: string;
  days: InsightsRangeDays;
}

/** One CLOSED Business Day of the current period. */
export interface InsightsClosedDayRow {
  date: string;
  /** Fuel sales value + product sales value of the day's DSSR snapshot. */
  sales: number;
  /** Net fuel volume of the day's DSSR snapshot. */
  volume: number;
}

/** Net fuel volume of one grade in one measurement unit ('L', 'kg', ...). */
export interface InsightsFuelVolumeRow {
  productCode: string;
  unit: string;
  quantity: number;
}

/** A Shift Template's Shifts over the current period, summed (core averages). */
export interface InsightsTemplateRow {
  templateId: string | null;
  name: string;
  shifts: number;
  totalSales: number;
  totalVolume: number;
  totalCashVariance: number;
}

export interface InsightsSalesSource {
  /**
   * The current and previous periods, ending at the last CLOSED Business Day.
   * Null when the Station has none, in which case every other field is empty.
   */
  range: InsightsDateRange | null;
  previousRange: InsightsDateRange | null;
  /** Closed days of the current period, oldest first. */
  days: InsightsClosedDayRow[];
  previous: { sales: number; closedDays: number; otherSales: number };
  /** Net volume per fuel grade and unit over the current period; core separates litres from the rest. */
  fuelVolumes: InsightsFuelVolumeRow[];
  other: {
    total: number;
    /** Best seller by revenue (not by quantity: units are not comparable across products). */
    top: { name: string; quantity: number; revenue: number } | null;
  };
  templates: InsightsTemplateRow[];
}

export interface InsightsSalesReader {
  read(query: InsightsRangeQuery): Promise<InsightsSalesSource>;
}

// ---------------------------------------------------------------------------
// Insights part 2 (#402). Same query shape and the same range end as the sales
// block; each reader answers one bounded, pre-aggregated source.
// ---------------------------------------------------------------------------

/**
 * One Attendant's variance over the current period, aggregated in the
 * database from the Drawers of closed Shift Summaries (two-level snapshots
 * only: a pre-#287 snapshot has no attendant level to read).
 */
export interface InsightsAttendantVarianceRow {
  attendantId: string;
  name: string;
  shifts: number;
  shortShifts: number;
  overShifts: number;
  netVariance: number;
}

export interface InsightsAttendantVarianceReader {
  /** At most `INSIGHTS_ATTENDANT_LIMIT` rows, those with the largest absolute net first. */
  read(query: InsightsRangeQuery): Promise<InsightsAttendantVarianceRow[]>;
}

/** The most Attendants one Station block lists. */
export const INSIGHTS_ATTENDANT_LIMIT = 25;

/**
 * One tank's recorded dip variance and sales over the current period. The
 * variance is what the closed days' DSSR snapshots state (every dip they
 * list), and its value was frozen in those snapshots: nothing live is read.
 */
export interface InsightsStockLossRow {
  tankId: string;
  tankName: string;
  productCode: string;
  /** Σ (actual − book) litres of the tank's Tank Dips on closed days; 0 with none. */
  varianceLitres: number;
  /** Net litres its Nozzles metered on closed days. */
  soldLitres: number;
  /** Tank Dips recorded on closed days of the range. */
  dips: number;
  /** Σ variance × the cost frozen in each day's snapshot; null when any dip's snapshot has none. */
  valueAtCost: number | null;
}

export interface InsightsStockLossReader {
  /** One row per active tank of the Station (and any inactive tank that has a dip or sales in the range). */
  read(query: InsightsRangeQuery): Promise<InsightsStockLossRow[]>;
}

export interface InsightsCreditHealthSource {
  range: InsightsDateRange | null;
  closedDays: number;
  /** Credit Sales (Business Date) and fuel + product sales of the closed days. */
  creditGiven: number;
  sales: number;
  /** Collections whose Entry Date falls in the range. */
  collected: number;
  previous: { creditGiven: number; closedDays: number };
}

export interface InsightsCreditHealthReader {
  read(query: InsightsRangeQuery): Promise<InsightsCreditHealthSource>;
}

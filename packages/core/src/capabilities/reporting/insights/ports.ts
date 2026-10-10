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

export interface InsightsSalesQuery {
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
  read(query: InsightsSalesQuery): Promise<InsightsSalesSource>;
}

import type { InsightsTrendDay } from '@pump/shared';

export interface TrendBar {
  date: string;
  /** Bar height as a percent of the chart (a closed day never falls below `MIN_BAR`). */
  heightPct: number;
  closed: boolean;
  best: boolean;
}

export const MIN_BAR = 8;

/**
 * Scale the trend's daily sales to bar heights. The scale starts below the
 * smallest closed day (as the prototype's does) so a calm week still shows its
 * shape; days with no closed Business Day are drawn as an empty stub.
 */
export function trendBars(trend: InsightsTrendDay[], bestDate: string | null): TrendBar[] {
  const closed = trend.filter((d) => d.closed).map((d) => d.sales);
  const max = closed.length ? Math.max(...closed) : 0;
  const min = closed.length ? Math.min(...closed) : 0;
  const floor = max > min ? min - (max - min) * 0.6 : 0;
  return trend.map((d) => ({
    date: d.date,
    closed: d.closed,
    best: d.closed && d.date === bestDate,
    heightPct: !d.closed
      ? 0
      : max > floor
        ? Math.max(MIN_BAR, Math.round(((d.sales - floor) / (max - floor)) * 100))
        : 50,
  }));
}

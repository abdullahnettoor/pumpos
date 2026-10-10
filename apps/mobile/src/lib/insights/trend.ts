import type { InsightsTrendDay } from '@pump/shared';

export interface TrendBar {
  /** First Business Date the bar covers. */
  date: string;
  /** Last Business Date the bar covers (equal to `date` for a daily bar). */
  to: string;
  /** Bar height as a percent of the chart (a closed bar never falls below `MIN_BAR`). */
  heightPct: number;
  closed: boolean;
  /** The bar holds the best day of the range. */
  best: boolean;
}

export type TrendGranularity = 'day' | 'week';

export const MIN_BAR = 8;

/** Up to this many bars the chart is daily; more days are drawn as weekly bars. */
export const MAX_DAILY_BARS = 31;

/** At or under this many bars the weekday letters fit under them. */
export const LABELLED_BARS = 14;

/** Gap between bars in px: roomy while there are few, hairline when the chart is dense. */
export const barGap = (count: number): number => (count > LABELLED_BARS ? 1 : 3);

/** Widest bar-stripe the app lays out at the smallest supported screen (320px less card padding). */
export const NARROW_CHART_PX = 280;

/** Pixel width of one bar in a chart of `count` bars across `width` px. */
export const barWidth = (count: number, width: number): number =>
  count > 0 ? (width - barGap(count) * (count - 1)) / count : 0;

interface Slot {
  from: string;
  to: string;
  /** Sales to scale by: a day's sales, or a week's average per closed day. */
  value: number;
  closed: boolean;
}

/** Group a long trend into 7-day buckets ending on the range end; each is scaled by its average per closed day. */
function weekly(trend: InsightsTrendDay[]): Slot[] {
  const slots: Slot[] = [];
  for (let end = trend.length; end > 0; end -= 7) {
    const chunk = trend.slice(Math.max(0, end - 7), end);
    const closed = chunk.filter((d) => d.closed);
    slots.unshift({
      from: chunk[0].date,
      to: chunk[chunk.length - 1].date,
      value: closed.length ? closed.reduce((s, d) => s + d.sales, 0) / closed.length : 0,
      closed: closed.length > 0,
    });
  }
  return slots;
}

/**
 * The trend as drawn: daily bars up to `MAX_DAILY_BARS`, weekly bars beyond that
 * (a 90-day range would otherwise be 90 bars under a pixel wide). A weekly bar
 * is the AVERAGE per closed day of its week, so a week with a gap isn't drawn as
 * a slump. The scale starts below the smallest closed bar (as the prototype's
 * does) so a calm period still shows its shape; a slot with no closed Business Day
 * is an empty stub.
 */
export function trendChart(
  trend: InsightsTrendDay[],
  bestDate: string | null,
): { granularity: TrendGranularity; bars: TrendBar[] } {
  const granularity: TrendGranularity = trend.length > MAX_DAILY_BARS ? 'week' : 'day';
  const slots: Slot[] =
    granularity === 'week'
      ? weekly(trend)
      : trend.map((d) => ({ from: d.date, to: d.date, value: d.sales, closed: d.closed }));

  const closed = slots.filter((s) => s.closed).map((s) => s.value);
  const max = closed.length ? Math.max(...closed) : 0;
  const min = closed.length ? Math.min(...closed) : 0;
  const floor = max > min ? min - (max - min) * 0.6 : 0;
  return {
    granularity,
    bars: slots.map((s) => ({
      date: s.from,
      to: s.to,
      closed: s.closed,
      best: bestDate !== null && s.closed && bestDate >= s.from && bestDate <= s.to,
      heightPct: !s.closed
        ? 0
        : max > floor
          ? Math.max(MIN_BAR, Math.round(((s.value - floor) / (max - floor)) * 100))
          : 50,
    })),
  };
}

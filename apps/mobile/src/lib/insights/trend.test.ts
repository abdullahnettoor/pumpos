import { describe, expect, it } from 'vitest';
import { INSIGHTS_RANGE_DAYS } from '@pump/shared';
import {
  barGap,
  barWidth,
  LABELLED_BARS,
  MAX_DAILY_BARS,
  MIN_BAR,
  NARROW_CHART_PX,
  trendChart,
} from './trend.js';

const day = (date: string, sales: number, closed = true) => ({
  date,
  sales,
  volume: 0,
  closed,
});

/** `n` consecutive Business Dates ending 2026-10-09. */
function dates(n: number): string[] {
  const end = Date.UTC(2026, 9, 9);
  return Array.from({ length: n }, (_, i) =>
    new Date(end - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

/** `n` days ending 2026-10-09, every 3rd one not traded. */
function span(n: number) {
  return dates(n).map((date, i) => day(date, 1000 + i * 10, i % 3 !== 0));
}

describe('trendChart (daily)', () => {
  it('scales closed days so the best day is full height and the smallest stays visible', () => {
    const { granularity, bars } = trendChart(
      [day('2026-10-01', 400), day('2026-10-02', 460), day('2026-10-03', 520)],
      '2026-10-03',
    );
    expect(granularity).toBe('day');
    expect(bars.map((b) => b.heightPct)).toEqual([38, 69, 100]);
    expect(bars[2].best).toBe(true);
    expect(bars[0].best).toBe(false);
  });

  it('draws a day with no closed Business Day as an empty stub', () => {
    const { bars } = trendChart([day('2026-10-01', 400), day('2026-10-02', 0, false)], null);
    expect(bars[1]).toMatchObject({ heightPct: 0, closed: false, best: false });
  });

  it('keeps a lone or flat series readable', () => {
    expect(trendChart([day('2026-10-01', 400)], '2026-10-01').bars[0].heightPct).toBe(100);
    expect(
      trendChart([day('2026-10-01', 0), day('2026-10-02', 1000)], null).bars.every(
        (b) => b.heightPct >= MIN_BAR,
      ),
    ).toBe(true);
  });

  it('is empty without a trend', () => {
    expect(trendChart([], null)).toEqual({ granularity: 'day', bars: [] });
  });

  it('stays daily through the 30-day range', () => {
    expect(trendChart(span(30), null).granularity).toBe('day');
    expect(trendChart(span(30), null).bars).toHaveLength(30);
  });
});

describe('trendChart (weekly)', () => {
  it('groups a 90-day range into 7-day bars ending on the range end', () => {
    const trend = span(90);
    const { granularity, bars } = trendChart(trend, null);
    expect(granularity).toBe('week');
    expect(bars).toHaveLength(13);
    expect(bars.at(-1)!.to).toBe(trend.at(-1)!.date);
    // 12 full weeks plus the 6 oldest days.
    expect(bars[0].date).toBe(trend[0].date);
    expect(bars[1].date).toBe(trend[6].date);
  });

  it('scales a week by its average per closed day, so a gap is not a slump', () => {
    // The last week trades on one day only at 1,000; every earlier week trades daily at 1,000.
    const trend = dates(90).map((date, i) => day(date, 1000, i < 83 || i === 89));
    const { bars } = trendChart(trend, null);
    expect(new Set(bars.filter((b) => b.closed).map((b) => b.heightPct))).toEqual(new Set([100]));
  });

  it('marks the bar holding the best day and leaves an all-open week empty', () => {
    const trend = span(90).map((d, i) => (i >= 83 ? { ...d, closed: false } : d));
    const best = trend[40];
    const { bars } = trendChart(trend, best.date);
    expect(bars.filter((b) => b.best)).toHaveLength(1);
    expect(bars.find((b) => b.best)!.date <= best.date).toBe(true);
    expect(bars.at(-1)).toMatchObject({ closed: false, heightPct: 0 });
  });
});

describe('bar size', () => {
  it('keeps every range legible: no bar under 4px at the narrowest layout', () => {
    for (const days of INSIGHTS_RANGE_DAYS) {
      const { bars } = trendChart(span(days), null);
      expect(bars.length).toBeLessThanOrEqual(MAX_DAILY_BARS);
      expect(barWidth(bars.length, NARROW_CHART_PX), `${days} days`).toBeGreaterThanOrEqual(4);
    }
  });

  it('tightens the gap as the chart gets dense', () => {
    expect(barGap(7)).toBe(3);
    expect(barGap(LABELLED_BARS)).toBe(3);
    expect(barGap(30)).toBe(1);
  });

  it('the old fixed 3px gap would have left 90 daily bars under a pixel', () => {
    expect((NARROW_CHART_PX - 3 * 89) / 90).toBeLessThan(1);
  });
});

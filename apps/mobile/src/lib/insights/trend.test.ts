import { describe, expect, it } from 'vitest';
import { MIN_BAR, trendBars } from './trend.js';

const day = (date: string, sales: number, closed = true) => ({
  date,
  sales,
  volume: 0,
  closed,
});

describe('trendBars', () => {
  it('scales closed days so the best day is full height and the smallest stays visible', () => {
    const bars = trendBars(
      [day('2026-10-01', 400), day('2026-10-02', 460), day('2026-10-03', 520)],
      '2026-10-03',
    );
    expect(bars.map((b) => b.heightPct)).toEqual([38, 69, 100]);
    expect(bars[2].best).toBe(true);
    expect(bars[0].best).toBe(false);
  });

  it('draws a day with no closed Business Day as an empty stub', () => {
    const bars = trendBars([day('2026-10-01', 400), day('2026-10-02', 0, false)], null);
    expect(bars[1]).toMatchObject({ heightPct: 0, closed: false, best: false });
  });

  it('keeps a lone or flat series readable', () => {
    expect(trendBars([day('2026-10-01', 400)], '2026-10-01')[0].heightPct).toBe(100);
    expect(
      trendBars([day('2026-10-01', 0), day('2026-10-02', 1000)], null).every(
        (b) => b.heightPct >= MIN_BAR,
      ),
    ).toBe(true);
  });

  it('is empty without a trend', () => {
    expect(trendBars([], null)).toEqual([]);
  });
});

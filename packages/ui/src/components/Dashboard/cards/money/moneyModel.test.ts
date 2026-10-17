import { describe, expect, it } from 'vitest';
import type { DailyCashBook } from '../../../../services/cloud.js';
import { bestDayIndex, buildTrendChart, deriveCashInHand } from './moneyModel.js';

describe('deriveCashInHand', () => {
  const book = {
    date: '2026-10-12',
    accounts: [
      { accountType: 'SAFE', closing: 50 },
      { accountType: 'CASH_IN_HAND', closing: 700 },
    ],
  } as unknown as DailyCashBook;
  it('reads the Cash in Hand account of the Cash Book', () => {
    expect(deriveCashInHand(book)).toBe(700);
  });
  it('is null without a Cash Book or account', () => {
    expect(deriveCashInHand(null)).toBeNull();
    expect(deriveCashInHand({ date: 'x', accounts: [] })).toBeNull();
  });
});

describe('trend chart', () => {
  const trend = [
    { sales: 100, closed: true },
    { sales: 300, closed: true },
    { sales: 200, closed: true },
    { sales: 900, closed: false },
  ];
  it('best day ignores draft days', () => {
    expect(bestDayIndex(trend)).toBe(1);
    expect(bestDayIndex([{ sales: 5, closed: false }])).toBe(-1);
  });
  it('builds sealed + draft lines and a best marker', () => {
    const c = buildTrendChart({ trend })!;
    expect(c.sealedLine.startsWith('M')).toBe(true);
    expect(c.draftLine.startsWith('M')).toBe(true);
    expect(c.bestCircle).not.toBeNull();
  });
  it('has no draft line when all days are sealed and null for empty', () => {
    expect(buildTrendChart({ trend: trend.slice(0, 3) })!.draftLine).toBe('');
    expect(buildTrendChart({ trend: [] })).toBeNull();
  });
});

describe('trend chart scale and previous series', () => {
  it('scales to the data range, not to zero', () => {
    const c = buildTrendChart({
      trend: [
        { sales: 1000, closed: true },
        { sales: 1100, closed: true },
      ],
    })!;
    const ys = [...c.sealedLine.matchAll(/ (\d+\.\d)/g)].map((m) => Number(m[1]));
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(30);
  });
  it('draws the previous series point by point, breaking at gaps', () => {
    const c = buildTrendChart({
      trend: [
        { sales: 1, closed: true },
        { sales: 2, closed: true },
        { sales: 3, closed: true },
      ],
      previousTrend: [
        { sales: 1, closed: true },
        { sales: 0, closed: false },
        { sales: 3, closed: true },
      ],
    })!;
    expect(c.prevLine.match(/M/g)).toHaveLength(2);
    expect(c.prevLine).not.toContain('L');
  });
  it('joins the draft line from the last sealed point', () => {
    const c = buildTrendChart({
      trend: [
        { sales: 1, closed: true },
        { sales: 2, closed: true },
        { sales: 3, closed: false },
      ],
    })!;
    expect(c.draftLine.match(/[ML]/g)).toHaveLength(2);
  });
});

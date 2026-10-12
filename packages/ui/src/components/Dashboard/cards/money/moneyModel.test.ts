import { describe, expect, it } from 'vitest';
import { bestDayIndex, buildTrendChart, deriveCashInHand } from './moneyModel.js';

describe('deriveCashInHand', () => {
  const book = {
    accounts: [
      { accountType: 'SAFE', closing: 50 },
      { accountType: 'CASH_IN_HAND', closing: 700 },
    ],
  };
  it('prefers the snapshot figure', () => {
    expect(deriveCashInHand({ cashInHand: '1200' }, book)).toBe(1200);
    expect(deriveCashInHand({ cashInHandClosing: 900 }, book)).toBe(900);
  });
  it('falls back to the Cash in Hand account', () => {
    expect(deriveCashInHand({}, book)).toBe(700);
  });
  it('is 0 with nothing', () => {
    expect(deriveCashInHand(null, null)).toBe(0);
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
    const c = buildTrendChart({ trend, average: 200 })!;
    expect(c.sealedLine.startsWith('M')).toBe(true);
    expect(c.draftLine.startsWith('M')).toBe(true);
    expect(c.bestCircle).not.toBeNull();
  });
  it('has no draft line when all days are sealed and null for empty', () => {
    expect(buildTrendChart({ trend: trend.slice(0, 3), average: 1 })!.draftLine).toBe('');
    expect(buildTrendChart({ trend: [], average: 0 })).toBeNull();
  });
});

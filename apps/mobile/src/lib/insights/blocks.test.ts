import { describe, expect, it } from 'vitest';
import type { InsightsStockLoss } from '@pump/shared';
import {
  attendantNote,
  attendantTone,
  creditBars,
  divergeBars,
  signedLitres,
  stockLossLine,
} from './blocks.js';

describe('divergeBars', () => {
  it('scales every bar to the largest absolute net, either side of zero', () => {
    expect(divergeBars([{ netVariance: -1590 }, { netVariance: 120 }, { netVariance: 0 }])).toEqual(
      [1, 120 / 1590, 0],
    );
  });
  it('draws nothing when everyone is on zero', () => {
    expect(divergeBars([{ netVariance: 0 }])).toEqual([0]);
    expect(divergeBars([])).toEqual([]);
  });
});

describe('attendantNote', () => {
  it('counts short and over Shifts', () => {
    expect(attendantNote({ shifts: 6, shortShifts: 3, overShifts: 0 })).toBe('3 of 6 shifts short');
    expect(attendantNote({ shifts: 4, shortShifts: 0, overShifts: 1 })).toBe('1 of 4 shifts over');
    expect(attendantNote({ shifts: 6, shortShifts: 2, overShifts: 1 })).toBe(
      '2 short · 1 over of 6 shifts',
    );
  });
  it('says balanced when no Shift was short or over', () => {
    expect(attendantNote({ shifts: 6, shortShifts: 0, overShifts: 0 })).toBe(
      'Balanced in all 6 shifts',
    );
    expect(attendantNote({ shifts: 1, shortShifts: 0, overShifts: 0 })).toBe('Balanced in 1 shift');
    expect(attendantNote({ shifts: 1, shortShifts: 1, overShifts: 0 })).toBe('1 of 1 shift short');
  });
});

describe('attendantTone', () => {
  it('is bad for short, a warning for over, good within the tolerance', () => {
    expect(attendantTone(-340)).toBe('bad');
    expect(attendantTone(120)).toBe('warn');
    expect(attendantTone(0.2)).toBe('good');
  });
});

describe('signedLitres', () => {
  it('writes the direction with a true minus', () => {
    expect(signedLitres(-42)).toBe('−42 L');
    expect(signedLitres(6.5)).toBe('+6.5 L');
    expect(signedLitres(-1234.56)).toBe('−1,234.6 L');
  });
  it('reads zero (and a hair of rounding) as 0 L', () => {
    expect(signedLitres(0)).toBe('0 L');
    expect(signedLitres(-0.04)).toBe('0 L');
  });
});

const tank = (over: Partial<InsightsStockLoss>): InsightsStockLoss => ({
  tankId: 't',
  tankName: 'Tank 1',
  productCode: 'MS',
  varianceLitres: -42,
  soldLitres: 15000,
  pctOfSold: -0.28,
  valueAtCost: -3780,
  withinTolerance: true,
  ...over,
});

describe('stockLossLine', () => {
  it('shows a loss within tolerance as plain, with the share of litres sold', () => {
    expect(stockLossLine(tank({}))).toEqual({
      litres: '−42 L',
      note: '0.28% of sold · within tolerance',
      tone: 'default',
      outside: false,
    });
  });
  it('flags a loss outside tolerance as bad and names the tolerance', () => {
    const l = stockLossLine(
      tank({ varianceLitres: -120, pctOfSold: -0.8, withinTolerance: false }),
    );
    expect(l.tone).toBe('bad');
    expect(l.outside).toBe(true);
    expect(l.note).toBe('0.8% of sold · outside 0.5% tolerance');
  });
  it('flags a gain outside tolerance as a warning', () => {
    expect(
      stockLossLine(tank({ varianceLitres: 90, pctOfSold: 0.6, withinTolerance: false })).tone,
    ).toBe('warn');
  });
  it('says nothing was sold rather than inventing a share', () => {
    expect(stockLossLine(tank({ soldLitres: 0, pctOfSold: null })).note).toBe(
      'nothing sold · within tolerance',
    );
  });
});

describe('creditBars', () => {
  it('scales both bars to the larger so they compare', () => {
    expect(creditBars(341000, 296000)).toEqual({
      given: 100,
      collected: (296000 / 341000) * 100,
    });
    expect(creditBars(100, 400)).toEqual({ given: 25, collected: 100 });
  });
  it('draws nothing when no credit moved', () => {
    expect(creditBars(0, 0)).toEqual({ given: 0, collected: 0 });
  });
});

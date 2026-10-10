import { describe, expect, it } from 'vitest';
import type { InsightsStockLoss } from '@pump/shared';
import { attendantBars, attendantNote, creditBars, stockLossLine } from './blocks.js';

describe('attendantBars', () => {
  it('scales every bar to the largest absolute net, either side of zero', () => {
    const v = attendantBars([{ netVariance: -1590 }, { netVariance: 120 }, { netVariance: 0 }]);
    expect(v.map((x) => x.bar)).toEqual([1, 120 / 1590, 0]);
    expect(v.map((x) => x.short)).toEqual([true, false, false]);
  });
  it('draws nothing when everyone is on zero', () => {
    expect(attendantBars([{ netVariance: 0 }]).map((x) => x.bar)).toEqual([0]);
    expect(attendantBars([])).toEqual([]);
  });
  it('uses ONE balanced rule for bar, tone and text: a -₹0.30 net is short on all three', () => {
    const [v] = attendantBars([{ netVariance: -0.3 }]);
    expect(v).toMatchObject({ balanced: false, short: true, tone: 'bad', text: '−₹0.30' });
    expect(v.bar).toBe(1);
  });
  it('a net inside the balanced rule has no bar and reads good', () => {
    const [v, big] = attendantBars([{ netVariance: -0.004 }, { netVariance: -340 }]);
    expect(v).toMatchObject({ balanced: true, tone: 'good', bar: 0, text: '₹0' });
    // The balanced row never stretches the scale of the others.
    expect(big.bar).toBe(1);
  });
  it('tone follows the sign once off balance: short bad, over warning', () => {
    const [short, over] = attendantBars([{ netVariance: -340 }, { netVariance: 120 }]);
    expect(short.tone).toBe('bad');
    expect(over.tone).toBe('warn');
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

const tank = (over: Partial<InsightsStockLoss>): InsightsStockLoss => ({
  tankId: 't',
  tankName: 'Tank 1',
  productCode: 'MS',
  varianceLitres: -42,
  soldLitres: 15000,
  pctOfSold: -0.28,
  dips: 3,
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
  it('says no dip was recorded for a tank with none, instead of claiming it is within tolerance', () => {
    expect(
      stockLossLine(tank({ dips: 0, varianceLitres: 0, pctOfSold: 0, valueAtCost: 0 })),
    ).toEqual({
      litres: '0 L',
      note: 'no dip recorded in this range',
      tone: 'default',
      outside: false,
    });
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

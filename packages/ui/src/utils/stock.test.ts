import { describe, expect, it } from 'vite-plus/test';
import { DEFAULT_TANK_LEVEL_SETTINGS } from '@pump/shared';
import { classifyTank, tankPct } from './stock.js';

const defaults = DEFAULT_TANK_LEVEL_SETTINGS;

describe('tank stock classification', () => {
  it('preserves percentages above capacity and classifies them separately', () => {
    const pct = tankPct(23_800, 20_000);

    expect(pct).toBe(119);
    expect(classifyTank(pct, defaults)).toBe('over');
  });

  it('uses the default station tank levels (25 / 40)', () => {
    expect(classifyTank(tankPct(2_400, 10_000), defaults)).toBe('critical');
    expect(classifyTank(tankPct(2_500, 10_000), defaults)).toBe('low');
    expect(classifyTank(tankPct(3_900, 10_000), defaults)).toBe('low');
    expect(classifyTank(tankPct(4_000, 10_000), defaults)).toBe('ok');
  });

  it('follows the station thresholds', () => {
    const custom = { criticalBelowPct: 10, lowBelowPct: 20 };
    expect(classifyTank(tankPct(1_500, 10_000), custom)).toBe('low');
    expect(classifyTank(tankPct(2_400, 10_000), custom)).toBe('ok');
  });
});

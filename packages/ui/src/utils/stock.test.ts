import { describe, expect, it } from 'vitest';
import { classifyTank, tankPct } from './stock.js';

describe('tank stock classification', () => {
  it('preserves percentages above capacity and classifies them separately', () => {
    const pct = tankPct(23_800, 20_000);

    expect(pct).toBe(119);
    expect(classifyTank(pct)).toBe('over');
  });

  it('keeps normal stock thresholds unchanged', () => {
    expect(classifyTank(tankPct(1_000, 10_000))).toBe('critical');
    expect(classifyTank(tankPct(2_000, 10_000))).toBe('low');
    expect(classifyTank(tankPct(7_500, 10_000))).toBe('ok');
  });
});

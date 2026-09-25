import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeRange } from './DateRangeField.js';

// 2026-03-01 02:00 IST = 2026-02-28 20:30 UTC. A UTC-derived date would land
// on February; the station calendar says March (#288).
const IST_EARLY_MARCH = new Date('2026-02-28T20:30:00.000Z');

describe('computeRange (station timezone, not UTC)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('anchors presets to the station date across a month boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(IST_EARLY_MARCH);
    const clock = { timeZone: 'Asia/Kolkata', dayStartsAt: '00:00' };
    expect(computeRange('today', clock)).toEqual({ from: '2026-03-01', to: '2026-03-01' });
    expect(computeRange('yesterday', clock)).toEqual({ from: '2026-02-28', to: '2026-02-28' });
    expect(computeRange('last-7', clock)).toEqual({ from: '2026-02-23', to: '2026-03-01' });
    expect(computeRange('this-month', clock)).toEqual({ from: '2026-03-01', to: '2026-03-01' });
  });
});

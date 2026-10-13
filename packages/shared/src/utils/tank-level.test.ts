import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TANK_LEVEL_SETTINGS,
  deriveTankLevel,
  resolveTankLevelSettings,
  tankLevelSettingsSchema,
  tankTone,
} from './tank-level.js';

describe('resolveTankLevelSettings', () => {
  it('defaults to critical below 25% and low below 40%', () => {
    expect(DEFAULT_TANK_LEVEL_SETTINGS).toEqual({ criticalBelowPct: 25, lowBelowPct: 40 });
    expect(resolveTankLevelSettings(undefined)).toEqual(DEFAULT_TANK_LEVEL_SETTINGS);
    expect(resolveTankLevelSettings(null)).toEqual(DEFAULT_TANK_LEVEL_SETTINGS);
    expect(resolveTankLevelSettings({})).toEqual(DEFAULT_TANK_LEVEL_SETTINGS);
    expect(resolveTankLevelSettings({ shift_grace_minutes: 15 })).toEqual(
      DEFAULT_TANK_LEVEL_SETTINGS,
    );
  });

  it('reads valid thresholds from station settings', () => {
    expect(
      resolveTankLevelSettings({ tankLevels: { criticalBelowPct: 15, lowBelowPct: 35 } }),
    ).toEqual({ criticalBelowPct: 15, lowBelowPct: 35 });
    expect(
      resolveTankLevelSettings({ tankLevels: { criticalBelowPct: 10.5, lowBelowPct: 100 } }),
    ).toEqual({ criticalBelowPct: 10.5, lowBelowPct: 100 });
  });

  it('falls back to defaults for invalid values', () => {
    for (const tankLevels of [
      'low',
      [25, 40],
      { criticalBelowPct: '20', lowBelowPct: 40 },
      { criticalBelowPct: 20 },
      { criticalBelowPct: 0, lowBelowPct: 40 },
      { criticalBelowPct: -5, lowBelowPct: 40 },
      { criticalBelowPct: 20, lowBelowPct: 101 },
      { criticalBelowPct: Number.NaN, lowBelowPct: 40 },
    ]) {
      expect(resolveTankLevelSettings({ tankLevels })).toEqual(DEFAULT_TANK_LEVEL_SETTINGS);
    }
  });

  it('requires critical to sit below low', () => {
    expect(
      resolveTankLevelSettings({ tankLevels: { criticalBelowPct: 40, lowBelowPct: 40 } }),
    ).toEqual(DEFAULT_TANK_LEVEL_SETTINGS);
    expect(
      resolveTankLevelSettings({ tankLevels: { criticalBelowPct: 50, lowBelowPct: 30 } }),
    ).toEqual(DEFAULT_TANK_LEVEL_SETTINGS);
    expect(
      tankLevelSettingsSchema.safeParse({ criticalBelowPct: 50, lowBelowPct: 30 }).success,
    ).toBe(false);
  });
});

describe('tankTone', () => {
  const s = DEFAULT_TANK_LEVEL_SETTINGS;
  it('is critical below the critical threshold, low below the low one, else ok', () => {
    expect(tankTone(0, s)).toBe('critical');
    expect(tankTone(24.9, s)).toBe('critical');
    expect(tankTone(25, s)).toBe('low');
    expect(tankTone(39.9, s)).toBe('low');
    expect(tankTone(40, s)).toBe('ok');
    expect(tankTone(130, s)).toBe('ok');
    expect(tankTone(null, s)).toBe('unknown');
  });

  it('follows the station thresholds', () => {
    const custom = { criticalBelowPct: 10, lowBelowPct: 20 };
    expect(tankTone(15, custom)).toBe('low');
    expect(tankTone(22, custom)).toBe('ok');
  });
});

describe('deriveTankLevel', () => {
  const s = DEFAULT_TANK_LEVEL_SETTINGS;

  it('derives fill, tone, stock of capacity and days of cover', () => {
    expect(
      deriveTankLevel(
        { capacity: '20000', currentVolume: '12400', daysOfCover: 2.6, waitingOnDecantation: true },
        s,
      ),
    ).toEqual({
      pct: 62,
      fill: 62,
      tone: 'ok',
      stock: 12400,
      capacity: 20000,
      daysOfCover: 2.6,
      overCapacity: false,
      waitingOnDecantation: true,
    });
  });

  it('marks a tank with no capacity as unknown', () => {
    const t = deriveTankLevel({ capacity: 0, currentVolume: 500 }, s);
    expect(t).toMatchObject({ pct: null, fill: 0, tone: 'unknown', daysOfCover: null });
  });

  it('keeps over-capacity book stock visible but caps the fill', () => {
    const t = deriveTankLevel({ capacity: 10000, currentVolume: 11500 }, s);
    expect(t).toMatchObject({ pct: 115, fill: 100, tone: 'ok', overCapacity: true });
  });

  it('clamps negative stock to empty and classifies on the unrounded percent', () => {
    expect(deriveTankLevel({ capacity: 1000, currentVolume: -5 }, s)).toMatchObject({
      pct: 0,
      stock: 0,
      tone: 'critical',
    });
    // 24.96% rounds to 25 but is still below the critical threshold.
    expect(deriveTankLevel({ capacity: 10000, currentVolume: 2496 }, s)).toMatchObject({
      pct: 25,
      tone: 'critical',
    });
  });

  it('treats missing or non-numeric days of cover as unknown', () => {
    expect(
      deriveTankLevel({ capacity: 1000, currentVolume: 500, daysOfCover: null }, s).daysOfCover,
    ).toBeNull();
    expect(
      deriveTankLevel({ capacity: 1000, currentVolume: 500, daysOfCover: 'soon' as never }, s)
        .daysOfCover,
    ).toBeNull();
  });
});

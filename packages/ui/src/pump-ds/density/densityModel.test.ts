import { describe, expect, it } from 'vitest';
import type { DensityTodayProductSummary } from '@pump/shared';
import { deriveDensityState, formatDensityReading, type DensityState } from './densityModel.js';

const BUSINESS_DATE = '2026-10-12';
const prod = (over: Partial<DensityTodayProductSummary>): DensityTodayProductSummary => ({
  productId: 'p1',
  productName: 'Petrol',
  productCode: 'MS',
  latestToday: null,
  todayRecorded: false,
  trend14d: [],
  trendValues: [],
  lastReadings: [],
  ...over,
});
const reading = (density15: number, kind = 'MORNING', businessDate = BUSINESS_DATE) =>
  ({ density15, kind, businessDate, observedTempC: 30, recordedAt: '2026-10-12T01:00:00Z' }) as any;

describe('deriveDensityState', () => {
  const trend = [
    { date: '2026-10-11', density15: 740 },
    { date: BUSINESS_DATE, density15: 741 },
  ];
  it('recorded with change vs yesterday', () => {
    const state = deriveDensityState(
      prod({ latestToday: reading(741), trend14d: trend }),
      BUSINESS_DATE,
      3,
    );
    expect(state).toMatchObject({ kind: 'recorded', change: { delta: 1, from: '2026-10-11' } });
  });
  it('flags a jump beyond tolerance', () => {
    const state = deriveDensityState(
      prod({ latestToday: reading(746), trend14d: trend }),
      BUSINESS_DATE,
      3,
    );
    expect(state.kind).toBe('jump');
  });
  it('uses the tolerance it is given (station setting), not a default', () => {
    const state = deriveDensityState(
      prod({ latestToday: reading(746), trend14d: trend }),
      BUSINESS_DATE,
      6,
    );
    expect(state.kind).toBe('recorded');
  });
  it('a decantation today explains the change', () => {
    const state = deriveDensityState(
      prod({
        latestToday: reading(746),
        trend14d: trend,
        lastReadings: [reading(746, 'DECANTATION')],
      }),
      BUSINESS_DATE,
      3,
    );
    expect(state.kind).toBe('recorded');
  });
  it('not recorded keeps the last value', () => {
    const state = deriveDensityState(
      prod({ trend14d: [{ date: '2026-10-10', density15: 739 }] }),
      BUSINESS_DATE,
      3,
    );
    expect(state).toEqual({ kind: 'not-recorded', last: 739 });
  });
  it('first day has no history', () => {
    const state = deriveDensityState(
      prod({ latestToday: reading(741), trend14d: [{ date: BUSINESS_DATE, density15: 741 }] }),
      BUSINESS_DATE,
      3,
    );
    expect(state.kind).toBe('no-history');
  });
});

describe('formatDensityReading', () => {
  // 01:00 UTC is 6:30 am in Kolkata and 2:45 pm in Chatham (UTC+13:45 in October).
  const recorded: DensityState = {
    kind: 'recorded',
    density: 741.24,
    tempC: 30,
    observedDensity: 731.5,
    at: '2026-10-12T01:00:00Z',
    change: { delta: 0.6, from: '2026-10-11' },
  };

  it('reads value at 15 °C, observed at temperature, time and change vs yesterday', () => {
    expect(
      formatDensityReading(recorded, { timeZone: 'Asia/Kolkata', businessDate: BUSINESS_DATE }),
    ).toEqual({
      status: 'recorded',
      value: '741.2',
      detail: '731.5 at 30 °C · 6:30 am',
      change: '+0.6 vs yday',
      flag: null,
    });
  });

  it('shows the time in the station timezone, never the device', () => {
    const display = formatDensityReading(recorded, {
      timeZone: 'Pacific/Chatham',
      businessDate: BUSINESS_DATE,
    });
    expect(display.detail).toBe('731.5 at 30 °C · 2:45 pm');
  });

  it('names an older comparison day', () => {
    const display = formatDensityReading(
      { ...recorded, change: { delta: -0.4, from: '2026-10-09' } },
      { timeZone: 'Asia/Kolkata', businessDate: BUSINESS_DATE },
    );
    expect(display.change).toMatch(/^\u22120\.4 vs 9 Oct/);
  });

  it('flags an unexplained jump in danger', () => {
    const display = formatDensityReading(
      { ...recorded, kind: 'jump', change: { delta: 5.2, from: '2026-10-11' } },
      { timeZone: 'Asia/Kolkata', businessDate: BUSINESS_DATE },
    );
    expect(display.status).toBe('jump');
    expect(display.flag).toEqual({ label: 'Unexplained jump', tone: 'danger' });
  });

  it('a direct 15 °C entry has no observed part', () => {
    const display = formatDensityReading(
      { ...recorded, observedDensity: null, tempC: null },
      { timeZone: 'Asia/Kolkata', businessDate: BUSINESS_DATE },
    );
    expect(display.detail).toBe('6:30 am');
  });

  it('first reading has no change', () => {
    const display = formatDensityReading(
      {
        kind: 'no-history',
        density: 741,
        tempC: 28.5,
        observedDensity: 745,
        at: recorded.at,
      },
      { timeZone: 'Asia/Kolkata', businessDate: BUSINESS_DATE },
    );
    expect(display.detail).toBe('745.0 at 28.5 °C · 6:30 am');
    expect(display.change).toBe('first reading');
  });

  it('not recorded warns and keeps the last value', () => {
    expect(
      formatDensityReading(
        { kind: 'not-recorded', last: 739.04 },
        { timeZone: 'Asia/Kolkata', businessDate: BUSINESS_DATE },
      ),
    ).toEqual({
      status: 'not-recorded',
      value: null,
      detail: 'last 739.0',
      change: null,
      flag: { label: 'Not recorded', tone: 'warning' },
    });
    expect(
      formatDensityReading(
        { kind: 'not-recorded', last: null },
        { timeZone: 'Asia/Kolkata', businessDate: BUSINESS_DATE },
      ).detail,
    ).toBe('no reading yet');
  });
});

import { describe, expect, it } from 'vitest';
import {
  businessDateLabel,
  businessWeekday,
  stationDay,
  stationDayMonth,
  stationMinuteOfDay,
  stationTime,
} from './dates.js';

const tz = 'Asia/Kolkata';
// 2026-10-09 20:30:00Z is 2:00 am on 10 Oct in Kolkata.
const instant = Date.parse('2026-10-09T20:30:00.000Z');

describe('station-timezone instants', () => {
  it('reads the calendar day in the station zone, not UTC', () => {
    expect(stationDay(instant, tz)).toBe('2026-10-10');
    expect(stationDay(instant, 'UTC')).toBe('2026-10-09');
  });
  it('formats the clock time and day in the station zone', () => {
    expect(stationTime(instant, tz)).toBe('2:00 am');
    expect(stationDayMonth(instant, tz)).toBe('10 Oct');
  });
  it('reads minutes after local midnight (midnight is 0, not 24)', () => {
    expect(stationMinuteOfDay(instant, tz)).toBe(120);
    expect(stationMinuteOfDay(Date.parse('2026-10-09T18:30:00Z'), tz)).toBe(0);
  });
});

describe('Business Date labels', () => {
  it('are calendar labels, unmoved by the device timezone', () => {
    expect(businessDateLabel('2026-10-09')).toBe('Fri, 9 Oct');
    expect(businessWeekday('2026-10-09')).toBe('Fri');
  });
});

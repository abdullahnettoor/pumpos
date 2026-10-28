import { describe, expect, it } from 'vite-plus/test';
import {
  businessDateLabel,
  businessWeekday,
  dateParts,
  shortDate,
  stationDay,
  stationDayMonth,
  stationMinuteOfDay,
  stationTime,
  weekdayOf,
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
  it('spell September "Sep", never "Sept" (#609)', () => {
    expect(businessDateLabel('2026-09-09')).toBe('Wed, 9 Sep');
    expect(stationDayMonth(Date.parse('2026-09-09T06:00:00Z'), tz)).toBe('9 Sep');
  });
});

describe('plain calendar labels', () => {
  it('reads a YYYY-MM-DD date by hand', () => {
    expect(dateParts('2026-09-03')).toEqual({ y: 2026, m: 9, d: 3 });
    expect(shortDate('2026-09-03')).toBe('3 Sep');
    expect(shortDate('2026-10-08')).toBe('8 Oct');
    expect(weekdayOf('2026-10-09')).toBe('Fri');
  });
});

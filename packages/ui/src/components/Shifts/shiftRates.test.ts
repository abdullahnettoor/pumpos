import { describe, expect, it } from 'vitest';
import type { FuelPriceRow } from '../StationSetup/fuelPriceRows.js';
import {
  plannedShiftWindow,
  rateChangeWarning,
  scheduledChangesDuringShift,
} from './shiftRates.js';

const CLOCK = { timeZone: 'Asia/Kolkata', dayStartsAt: '06:00' };
const morning = { id: 't1', name: 'Morning', startTime: '06:00', endTime: '14:00' };
const night = { id: 't3', name: 'Night', startTime: '22:00', endTime: '06:00' };
const ist = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`).getTime();
const iso = (date: string, hhmm: string) => new Date(ist(date, hhmm)).toISOString();

const row = (over: Partial<FuelPriceRow> = {}): FuelPriceRow => ({
  productId: 'ms',
  productName: 'Petrol',
  productCode: 'MS',
  unit: 'L',
  price: 102.5,
  effectiveFrom: iso('2026-10-12', '06:00'),
  lastChange: null,
  scheduled: { price: 103, effectiveFrom: iso('2026-10-16', '10:00') },
  ...over,
});

describe('plannedShiftWindow (#619)', () => {
  it('is the template window on the Business Date, on the station clock', () => {
    expect(plannedShiftWindow(morning, '2026-10-16', CLOCK)).toEqual({
      startAt: ist('2026-10-16', '06:00'),
      endAt: ist('2026-10-16', '14:00'),
    });
  });

  it('runs past midnight for a window that wraps', () => {
    expect(plannedShiftWindow(night, '2026-10-16', CLOCK)).toEqual({
      startAt: ist('2026-10-16', '22:00'),
      endAt: ist('2026-10-17', '06:00'),
    });
  });
});

describe('scheduledChangesDuringShift (#619)', () => {
  const window = plannedShiftWindow(morning, '2026-10-16', CLOCK);
  const now = ist('2026-10-16', '06:30');

  it('warns for a change that takes effect inside the planned window', () => {
    expect(scheduledChangesDuringShift([row()], window, now)).toEqual([
      {
        productId: 'ms',
        productName: 'Petrol',
        unit: 'L',
        from: 102.5,
        to: 103,
        at: iso('2026-10-16', '10:00'),
      },
    ]);
  });

  it('does not warn for a change after the planned end, or exactly at it', () => {
    const later = row({ scheduled: { price: 103, effectiveFrom: iso('2026-10-16', '15:00') } });
    const atEnd = row({ scheduled: { price: 103, effectiveFrom: iso('2026-10-16', '14:00') } });
    expect(scheduledChangesDuringShift([later, atEnd], window, now)).toEqual([]);
  });

  it('does not warn with nothing scheduled, no current price, or no template', () => {
    expect(scheduledChangesDuringShift([row({ scheduled: null })], window, now)).toEqual([]);
    expect(scheduledChangesDuringShift([row({ price: null })], window, now)).toEqual([]);
    expect(scheduledChangesDuringShift([row()], null, now)).toEqual([]);
  });

  it('warns on an early open for a change before the planned start (#628 review)', () => {
    // Opened at 5:30 am for the 6:00 am Morning shift; Petrol changes at 5:45 am.
    // Opening now locks today's rate, so the shift runs through the change.
    const early = row({ scheduled: { price: 103, effectiveFrom: iso('2026-10-16', '05:45') } });
    expect(scheduledChangesDuringShift([early], window, ist('2026-10-16', '05:30'))).toEqual([
      expect.objectContaining({ productId: 'ms', at: iso('2026-10-16', '05:45') }),
    ]);
  });

  it('does not warn once the planned end has passed', () => {
    expect(scheduledChangesDuringShift([row()], window, ist('2026-10-16', '14:30'))).toEqual([]);
  });

  it('warns for an overnight shift through a change at Day Start', () => {
    const nightWindow = plannedShiftWindow(night, '2026-10-16', CLOCK);
    const atSix = row({ scheduled: { price: 103, effectiveFrom: iso('2026-10-17', '05:00') } });
    expect(
      scheduledChangesDuringShift([atSix], nightWindow, ist('2026-10-16', '22:05')),
    ).toHaveLength(1);
  });

  it('reads as the owner wrote it', () => {
    const [change] = scheduledChangesDuringShift([row()], window, now);
    expect(rateChangeWarning(change!, CLOCK.timeZone)).toBe(
      'Petrol changes to ₹103.00 at 10:00\u00a0am, during this shift. This shift keeps ₹102.50. ' +
        'Close and reopen the shift at 10:00\u00a0am to use the new rate.',
    );
  });
});

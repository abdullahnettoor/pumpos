import { localToInstant, templateWindow } from '@pump/shared';
import type { FuelPriceRow } from '../StationSetup/fuelPriceRows.js';
import { formatClockInZone, formatMoney } from '../../utils/format.js';

/**
 * "Rates for this shift" on the Open shift form (#619). Pure, so the rule is
 * tested here, never in the form.
 *
 * A shift sells each fuel at the price current when it opens, for its whole
 * life (owner decision, #619: no mid-shift price change). A change scheduled
 * to take effect while the shift runs does not reach it; the form warns, so
 * the operator can close and reopen at that time to use the new rate.
 */

/** A shift template's scheduled times (`HH:MM`, station clock). */
export interface ShiftTemplateTimes {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

/** The station clock: its timezone and Day Start (`HH:MM`). */
export interface StationClock {
  timeZone: string;
  dayStartsAt: string;
}

const minutes = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

/**
 * A template's planned window on a Business Date (epoch ms), the same window
 * the Dashboard timeline draws: from its start, past midnight if it wraps.
 */
export function plannedShiftWindow(
  template: ShiftTemplateTimes,
  businessDate: string,
  clock: StationClock,
): { startAt: number; endAt: number } {
  const dayStartAt = localToInstant(businessDate, clock.dayStartsAt, clock.timeZone);
  const w = templateWindow({ ...template, isActive: true }, dayStartAt, minutes(clock.dayStartsAt));
  return { startAt: w.startAt, endAt: w.endAt };
}

/** A scheduled change that takes effect while the shift runs: the shift keeps `from`. */
export interface ShiftRateChange {
  productId: string;
  productName: string;
  unit: string;
  /** The rate the shift opens with and keeps. */
  from: number;
  /** The scheduled rate, and when it takes effect (ISO instant). */
  to: number;
  at: string;
}

/**
 * Each fuel whose next scheduled change takes effect after `now` and before
 * the planned end of the shift: the shift, opened now, runs through it. A
 * shift opened after its planned end, or a change after it, gets no warning.
 */
export function scheduledChangesDuringShift(
  rows: readonly FuelPriceRow[],
  window: { startAt: number; endAt: number } | null,
  now: number,
): ShiftRateChange[] {
  if (!window) return [];
  return rows.flatMap((r) => {
    if (r.price == null || !r.scheduled) return [];
    const t = new Date(r.scheduled.effectiveFrom).getTime();
    if (!(t > now && t < window.endAt)) return [];
    return [
      {
        productId: r.productId,
        productName: r.productName,
        unit: r.unit,
        from: r.price,
        to: r.scheduled.price,
        at: r.scheduled.effectiveFrom,
      },
    ];
  });
}

/**
 * The warning above Open shift: "Petrol changes to ₹103.00 at 6:00 am, during
 * this shift. This shift keeps ₹102.50. Close and reopen the shift at 6:00 am
 * to use the new rate."
 */
export function rateChangeWarning(c: ShiftRateChange, timeZone: string): string {
  const at = formatClockInZone(c.at, timeZone);
  return (
    `${c.productName} changes to ${formatMoney(c.to)} at ${at}, during this shift. ` +
    `This shift keeps ${formatMoney(c.from)}. ` +
    `Close and reopen the shift at ${at} to use the new rate.`
  );
}

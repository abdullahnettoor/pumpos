/**
 * Date and time labels for Home. Two kinds of input, kept apart:
 *  - an instant (`Date.parse(openedAt)`) shown in the STATION's timezone;
 *  - a Business Date (`YYYY-MM-DD`), a calendar label with no instant behind it,
 *    always formatted in UTC so the device's zone cannot shift the day.
 * Every Intl call for Home lives here.
 */
import { resolveEntryDate } from '@pump/shared';

const LOCALE = 'en-IN';

/** Calendar date (`YYYY-MM-DD`) of an instant in the station's timezone. */
export const stationDay = (ms: number, timeZone: string): string =>
  resolveEntryDate({ now: new Date(ms), timeZone });

/** `2:00 pm` in the station's timezone. */
export const stationTime = (ms: number, timeZone: string): string =>
  new Intl.DateTimeFormat(LOCALE, { timeZone, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(ms))
    .toLowerCase();

/** `9 Oct` in the station's timezone. */
export const stationDayMonth = (ms: number, timeZone: string): string =>
  new Intl.DateTimeFormat(LOCALE, { timeZone, day: 'numeric', month: 'short' }).format(
    new Date(ms),
  );

const businessDateInstant = (businessDate: string) => new Date(`${businessDate}T00:00:00Z`);

/** `Fri, 9 Oct` for a Business Date. */
export const businessDateLabel = (businessDate: string): string =>
  businessDateInstant(businessDate).toLocaleDateString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** `Fri` for a Business Date. */
export const businessWeekday = (businessDate: string): string =>
  businessDateInstant(businessDate).toLocaleDateString(LOCALE, {
    weekday: 'short',
    timeZone: 'UTC',
  });

import { stationDay, stationDayMonth, stationTime } from '../dates.js';

/**
 * "6:00 am – 1:52 pm" in the station's timezone. A Shift that ends on another
 * calendar day than it opened names that day ("10:00 pm – 10 Oct, 6:04 am");
 * one with no close time says only when it opened.
 */
export function windowLabel(
  openedAt: string | null | undefined,
  closedAt: string | null | undefined,
  timeZone: string,
): string {
  const opened = openedAt ? Date.parse(openedAt) : NaN;
  if (!Number.isFinite(opened)) return '—';
  const start = stationTime(opened, timeZone);
  const closed = closedAt ? Date.parse(closedAt) : NaN;
  if (!Number.isFinite(closed)) return `Opened ${start}`;
  const end =
    stationDay(closed, timeZone) === stationDay(opened, timeZone)
      ? stationTime(closed, timeZone)
      : `${stationDayMonth(closed, timeZone)}, ${stationTime(closed, timeZone)}`;
  return `${start} – ${end}`;
}

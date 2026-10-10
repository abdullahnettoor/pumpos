import { stationDay, stationDayMonth, stationTime } from './dates.js';
import { plural } from '../format.js';
import type { Snapshot } from './sales.js';

/** `3h 12m` since the Shift opened (same shape as the console's shift bar). */
export function elapsedLabel(openedAt: string, now: number): string {
  const opened = Date.parse(openedAt);
  if (!Number.isFinite(opened)) return '—';
  const mins = Math.floor(Math.max(0, now - opened) / 60_000);
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/** Opening time in the station's timezone: `2:00 pm`, or `9 Oct, 2:00 pm` from an earlier day. */
export function sinceLabel(openedAt: string, now: number, timeZone: string): string {
  const opened = Date.parse(openedAt);
  if (!Number.isFinite(opened)) return '—';
  const time = stationTime(opened, timeZone);
  if (stationDay(opened, timeZone) === stationDay(now, timeZone)) return time;
  return `${stationDayMonth(opened, timeZone)}, ${time}`;
}

export interface LiveShift {
  name: string;
  /** "Since 2:00 pm · 3 attendants". */
  detail: string;
  elapsed: string;
  /** False when the running Shift belongs to an earlier Business Day than today. */
  inCurrentDay: boolean;
}

/** The running Shift for the Home strip, from the full shift-status payload. */
export function deriveLiveShift(
  status: unknown,
  currentBusinessDate: string,
  now: number,
  timeZone: string,
): LiveShift | null {
  const shift = (status as Snapshot | null | undefined)?.activeShift as Snapshot | null | undefined;
  if (!shift) return null;
  const attendants = new Set(
    ((shift.staffAssignments ?? []) as Snapshot[])
      .map((a) => a.userId ?? a.userName)
      .filter((id) => id != null),
  ).size;
  return {
    name: String(shift.templateName || 'Shift'),
    detail: `Since ${sinceLabel(String(shift.openedAt), now, timeZone)} · ${
      attendants ? plural(attendants, 'attendant') : 'No attendants yet'
    }`,
    elapsed: elapsedLabel(String(shift.openedAt), now),
    inCurrentDay: !shift.businessDate || shift.businessDate === currentBusinessDate,
  };
}

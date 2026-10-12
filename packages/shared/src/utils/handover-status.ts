/**
 * Handover status of a Dispenser Unit during a running Shift. One rule for
 * mobile, web and desktop: a DU is Recorded when its Handover exists; otherwise
 * Handover due once the Shift's Scheduled Shift Window end has passed in the
 * station timezone; otherwise Pending.
 */

export type DuStatus = 'recorded' | 'pending' | 'due';

const MINUTES_PER_DAY = 1440;

const timeToMinutes = (hhmm: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Minutes after local midnight of an instant (ms) in the station's timezone. */
export function stationMinuteOfDay(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return at('hour') * 60 + at('minute');
}

/**
 * True once the Shift has run past its template's scheduled end. The end is the
 * first occurrence of the template's end time after the Shift opened, so a night
 * Shift (10 pm – 6 am) is due at 6 am the next morning. Without a schedule a
 * Shift is never "due".
 */
export function isHandoverDue(
  openedAt: string,
  now: number,
  scheduledEnd: string | null | undefined,
  timeZone: string,
): boolean {
  const opened = Date.parse(openedAt);
  const end = timeToMinutes(scheduledEnd);
  if (!Number.isFinite(opened) || end === null) return false;
  const untilEnd = (end - stationMinuteOfDay(opened, timeZone) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return now - opened >= untilEnd * 60_000;
}

/** The three-way rule for one DU. */
export function handoverStatus(hasHandover: boolean, due: boolean): DuStatus {
  return hasHandover ? 'recorded' : due ? 'due' : 'pending';
}

export interface HandoverShiftLike {
  openedAt: string;
  scheduledEndTime?: string | null;
  staffAssignments?: ReadonlyArray<{
    userId?: string | number | null;
    duId?: string | number | null;
  }> | null;
  handovers?: ReadonlyArray<{
    userId?: string | number | null;
    duId?: string | number | null;
  }> | null;
}

/** Status for each of the shift's DU assignments, in assignment order. */
export function deriveDuHandoverStatuses(
  shift: HandoverShiftLike,
  now: number,
  timeZone: string,
): DuStatus[] {
  const done = new Set((shift.handovers ?? []).map((h) => `${h.userId}:${h.duId}`));
  const due = isHandoverDue(String(shift.openedAt), now, shift.scheduledEndTime, timeZone);
  return (shift.staffAssignments ?? []).map((a) =>
    handoverStatus(done.has(`${a.userId}:${a.duId}`), due),
  );
}

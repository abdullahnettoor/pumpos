/**
 * The running Shift for the Shifts tab, from the full shift-status payload.
 * View-only: everything here is read from the server's own figures (handover
 * rows, reconciliation totals), never recomputed.
 */
import { businessDateLabel, stationMinuteOfDay } from '../dates.js';
import { elapsedLabel, sinceLabel } from '../home/live.js';
import { num } from '../num.js';
import { shiftLabel, type Snapshot } from '../home/sales.js';

export type DuStatus = 'recorded' | 'pending' | 'due';

export interface LiveDu {
  key: string;
  duName: string;
  attendant: string;
  status: DuStatus;
  /** Recorded rows: what the attendant declared and the server's variance. */
  declared: number | null;
  variance: number | null;
}

export interface LiveShiftCard {
  name: string;
  businessDateLabel: string;
  /** "since 2:00 pm" (with the day when it opened earlier). */
  since: string;
  elapsed: string;
  openedBy: string;
  openingFloats: number;
  cashDrops: number;
  nozzles: number;
  recorded: number;
  total: number;
  dus: LiveDu[];
}

const MINUTES_PER_DAY = 1440;

const timeToMinutes = (hhmm: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

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

export function deriveLiveShiftCard(
  status: unknown,
  now: number,
  timeZone: string,
): LiveShiftCard | null {
  const shift = (status as Snapshot | null | undefined)?.activeShift as Snapshot | null | undefined;
  if (!shift) return null;

  const assignments = (shift.staffAssignments ?? []) as Snapshot[];
  const handovers = new Map(
    ((shift.handovers ?? []) as Snapshot[]).map((h) => [`${h.userId}:${h.duId}`, h]),
  );
  const due = isHandoverDue(String(shift.openedAt), now, shift.scheduledEndTime, timeZone);

  const dus = assignments.map((a, i): LiveDu => {
    const h = handovers.get(`${a.userId}:${a.duId}`);
    return {
      key: String(a.id ?? `${a.userId}:${a.duId}:${i}`),
      duName: String(a.duName ?? a.duCode ?? 'DU'),
      attendant: String(a.userName ?? 'Attendant'),
      status: h ? 'recorded' : due ? 'due' : 'pending',
      declared: h ? num(h.cashHandedOver) : null,
      variance: h ? num(h.varianceAmount) : null,
    };
  });

  const recon = (shift.reconciliation ?? {}) as Snapshot;
  return {
    name: shiftLabel(shift),
    businessDateLabel: shift.businessDate ? businessDateLabel(String(shift.businessDate)) : '',
    since: `since ${sinceLabel(String(shift.openedAt), now, timeZone)}`,
    elapsed: elapsedLabel(String(shift.openedAt), now),
    openedBy: String(shift.openedByName ?? 'Operator'),
    openingFloats:
      recon.openingFloat != null
        ? num(recon.openingFloat)
        : assignments.reduce((s, a) => s + num(a.openingFloat), 0),
    cashDrops: num(recon.handoverCashDrops),
    nozzles: ((shift.nozzleReadings ?? []) as Snapshot[]).length,
    recorded: dus.filter((d) => d.status === 'recorded').length,
    total: dus.length,
    dus,
  };
}

/**
 * The running Shift for the Shifts tab, from the full shift-status payload.
 * View-only: everything here is read from the server's own figures (handover
 * rows, reconciliation totals), never recomputed.
 */
import { handoverStatus, isHandoverDue, type DuStatus as SharedDuStatus } from '@pump/shared';
import { businessDateLabel } from '../dates.js';
import { elapsedLabel, sinceLabel } from '../home/live.js';
import { num } from '../num.js';
import { shiftLabel, type Snapshot } from '../home/sales.js';

export type DuStatus = SharedDuStatus;

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

export { isHandoverDue };

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
      status: handoverStatus(Boolean(h), due),
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

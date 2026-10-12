import {
  deriveDuHandoverStatuses,
  isDayShiftsDone,
  isHandoverDue,
  nextShiftToOpen,
  type DuStatus,
} from '@pump/shared';
import {
  formatClockInZone,
  formatElapsedBetween,
  formatHHMM,
  formatShortDay,
} from '../../../../utils/format.js';

type Row = Record<string, any>;

/** "Shift 2" from the day sequence; the template name when it is unknown. */
const shiftName = (s: Row): string =>
  s.shiftSequence ? `Shift ${Number(s.shiftSequence)}` : String(s.templateName ?? 'Shift');

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const formatElapsed = (openedAt: string, now: number): string =>
  formatElapsedBetween(Date.parse(openedAt), now);

export interface DuRow {
  key: string;
  duName: string;
  attendant: string;
  fuels: string;
  status: DuStatus;
  /** Declared cash once recorded; null while the handover is open. */
  declared: number | null;
  /** Server variance once recorded. */
  variance: number | null;
}

export interface LiveForecourt {
  kind: 'live';
  shiftId: string;
  name: string;
  /** Epoch-free label, e.g. "Live 3h 12m" or "Past scheduled end". */
  pastEnd: boolean;
  elapsed: string;
  window: string | null;
  endLabel: string | null;
  recorded: number;
  total: number;
  floats: number;
  open: number;
  /** DUs not handed over first, then recorded; assignment order inside each. */
  dus: DuRow[];
  last: LastClosed | null;
}

export interface LastClosed {
  shiftId: string;
  name: string;
  /** "Shift 2 · Thu 8 Oct" when the shift is not of the current Business Day. */
  label: string;
  sales: number | null;
  litres: number | null;
  variance: number | null;
}

export interface IdleForecourt {
  kind: 'between' | 'done' | 'none';
  /** "Shift 2 is scheduled from 2:00 pm." style hint, when known. */
  hint: string | null;
  last: LastClosed | null;
}

export type ForecourtModel = LiveForecourt | IdleForecourt;

export interface DeriveInput {
  status: Row | null | undefined;
  summary: Row | null | undefined;
  templates: Row[] | null | undefined;
  now: number;
  timeZone: string;
  dayStartsAt: string;
  /** Current Business Date; a last-closed shift of another date shows its day. */
  businessDate?: string;
}

function lastClosed(
  summary: Row | null | undefined,
  businessDate: string | undefined,
): LastClosed | null {
  const shift = summary?.lastShift as Row | null | undefined;
  if (!shift) return null;
  const s = summary?.lastShiftSummary as Row | null | undefined;
  const name = shiftName(shift);
  const date = typeof shift.businessDate === 'string' ? shift.businessDate : null;
  return {
    shiftId: String(shift.id),
    name,
    label:
      date && businessDate && date !== businessDate ? `${name} · ${formatShortDay(date)}` : name,
    sales: s && s.totalFuelSalesValue != null ? num(s.totalFuelSalesValue) : null,
    litres: s && s.totalVolumeSold != null ? num(s.totalVolumeSold) : null,
    variance: s && s.cashVariance != null ? num(s.cashVariance) : null,
  };
}

export function deriveForecourt(input: DeriveInput): ForecourtModel {
  const { status, summary, templates, now, timeZone, dayStartsAt, businessDate } = input;
  const shift = status?.activeShift as Row | null | undefined;
  const last = lastClosed(summary, businessDate);

  if (!shift) {
    const todayShifts = (summary?.today?.shifts ?? []) as Row[];
    const tpls = (templates ?? []).map((t) => ({
      id: String(t.id),
      name: String(t.name),
      startTime: String(t.startTime),
      endTime: String(t.endTime),
      isActive: t.isActive !== false,
    }));
    const timelineInput = {
      now: new Date(now),
      shifts: todayShifts.map((s) => ({
        shiftTemplateId: String(s.shiftTemplateId),
        openedAt: s.openedAt,
        closedAt: s.closedAt ?? null,
      })),
      templates: tpls,
      timeZone,
      dayStartsAt,
    };
    const next = nextShiftToOpen(timelineInput);
    if (todayShifts.length > 0) {
      if (isDayShiftsDone(timelineInput)) {
        return { kind: 'done', hint: 'All of today’s scheduled shifts have closed.', last };
      }
      return {
        kind: 'between',
        hint: next?.window
          ? `${next.window.name} is scheduled from ${formatClockInZone(next.window.startAt, timeZone)}.`
          : null,
        last,
      };
    }
    const first = next?.firstTemplate;
    return {
      kind: 'none',
      hint: first ? `${first.name} is scheduled from ${formatHHMM(first.startTime)}.` : null,
      last,
    };
  }

  const assignments = (shift.staffAssignments ?? []) as Row[];
  const handovers = (shift.handovers ?? []) as Row[];
  const readings = (shift.nozzleReadings ?? []) as Row[];
  const statuses = deriveDuHandoverStatuses(
    {
      openedAt: String(shift.openedAt),
      scheduledEndTime: shift.scheduledEndTime,
      staffAssignments: assignments,
      handovers,
    },
    now,
    timeZone,
  );
  const dus = assignments.map((a, i): DuRow => {
    const h = handovers.find((x) => x.userId === a.userId && x.duId === a.duId);
    const fuels = Array.from(
      new Set(
        readings
          .filter((r) => r.duId === a.duId)
          .map((r) => `${r.nozzleName} (${r.productCode ?? r.productName})`),
      ),
    ).join(' · ');
    return {
      key: String(a.id ?? `${a.userId}:${a.duId}:${i}`),
      duName: String(a.duName ?? a.duCode ?? 'DU'),
      attendant: String(a.userName ?? 'Attendant'),
      fuels,
      status: statuses[i] ?? 'pending',
      declared: h ? num(h.cashHandedOver) : null,
      variance: h ? num(h.varianceAmount) : null,
    };
  });
  const sorted = [
    ...dus.filter((d) => d.status !== 'recorded'),
    ...dus.filter((d) => d.status === 'recorded'),
  ];
  const recon = (shift.reconciliation ?? {}) as Row;
  const tpl = (templates ?? []).find((t) => t.id === shift.shiftTemplateId);
  const end = (shift.scheduledEndTime ?? tpl?.endTime) as string | null | undefined;
  const start = (shift.scheduledStartTime ?? tpl?.startTime) as string | null | undefined;
  const recorded = dus.length - sorted.filter((d) => d.status !== 'recorded').length;
  return {
    kind: 'live',
    shiftId: String(shift.id),
    name: shiftName(shift),
    pastEnd: isHandoverDue(String(shift.openedAt), now, shift.scheduledEndTime, timeZone),
    elapsed: formatElapsed(String(shift.openedAt), now),
    window: start && end ? `${formatHHMM(start)} → ${formatHHMM(end)}` : null,
    endLabel: end ? formatHHMM(end) : null,
    recorded,
    total: dus.length,
    floats:
      recon.openingFloat != null
        ? num(recon.openingFloat)
        : assignments.reduce((s, a) => s + num(a.openingFloat), 0),
    open: dus.length - recorded,
    dus: sorted,
    last,
  };
}

import type { DashboardTimeline, EventPin, TimelineTemplate } from '@pump/shared';
import {
  formatAxisHour,
  formatClockInZone,
  formatHHMM,
  formatMoney,
} from '../../../../utils/format.js';

export interface ShiftBarInput {
  id: string;
  name: string;
  sequence: number | null;
  openedAt: string;
  closedAt: string | null;
  /** Closed shifts only: server totals from the dashboard summary. */
  total: number | null;
  variance: number | null;
  /** Scheduled end of the shift's template window (epoch ms), when known. */
  scheduledEndAt?: number | null;
  /** Scheduled start of the shift's template window (epoch ms), when known. */
  scheduledStartAt?: number | null;
  /** Drawers still to hand over, when known. */
  handoversDue?: number | null;
}

export interface Bar {
  id: string;
  kind: 'closed' | 'running' | 'ghost';
  label: string;
  leftPct: number;
  widthPct: number;
  total: number | null;
  variance: number | null;
  /** Bar text before the reduced-opacity variance suffix. */
  text: string;
  /** Closed shifts: signed variance text ("−₹340"), shown dimmed. */
  varianceText: string | null;
  /** Running shift past its scheduled end. */
  late: boolean;
  /** Short sequence label ("Shift 2"). */
  name: string;
  /** Actual times for the tooltip ("Opened 5:49 am · closed 1:52 pm"); null for a ghost. */
  times: string | null;
  /** Running shift: share of its window already elapsed (0–1), hatched up to now. */
  progress: number | null;
}

/** The shift's Scheduled Shift Window on the axis, when its template is known. */
function scheduledWindow(s: ShiftBarInput): { start: number; end: number } | null {
  if (s.scheduledStartAt == null || s.scheduledEndAt == null) return null;
  return s.scheduledEndAt > s.scheduledStartAt
    ? { start: s.scheduledStartAt, end: s.scheduledEndAt }
    : null;
}

function actualTimes(s: ShiftBarInput, timeZone: string): string {
  const opened = `Opened ${clockLabel(Date.parse(s.openedAt), timeZone)}`;
  return s.closedAt ? `${opened} · closed ${clockLabel(Date.parse(s.closedAt), timeZone)}` : opened;
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/** Position (0–100) of an instant on the Day Start → Day Start axis. */
export function axisPct(
  at: number,
  tl: Pick<DashboardTimeline, 'dayStartAt' | 'dayEndAt'>,
): number {
  return clampPct(((at - tl.dayStartAt) / (tl.dayEndAt - tl.dayStartAt)) * 100);
}

export function buildBars(
  shifts: readonly ShiftBarInput[],
  tl: DashboardTimeline,
  now: number,
  timeZone: string,
): Bar[] {
  const bars: Bar[] = shifts.map((s) => {
    // The bar spans the shift's Scheduled Shift Window (its template timing);
    // the actual opening is shown by the opening chip. A shift with no known
    // window (ad-hoc, template since removed) falls back to its real times.
    const window = scheduledWindow(s);
    const start = window ? window.start : Date.parse(s.openedAt);
    const end = window ? window.end : s.closedAt ? Date.parse(s.closedAt) : now;
    const left = axisPct(start, tl);
    const name = s.sequence ? `Shift ${s.sequence}` : s.name;
    const kind = s.closedAt ? 'closed' : 'running';
    const late = kind === 'running' && s.scheduledEndAt != null && now > s.scheduledEndAt;
    const due = s.handoversDue ?? 0;
    const text =
      kind === 'closed'
        ? s.total != null
          ? `${name} · ${money(s.total)}`
          : name
        : late
          ? `${name} · past end${due > 0 ? `, ${due} handover${due === 1 ? '' : 's'} due` : ''}`
          : `${name} · live`;
    return {
      id: s.id,
      kind,
      label: name,
      name,
      text,
      late,
      times: actualTimes(s, timeZone),
      progress:
        kind === 'running' && end > start
          ? Math.max(0, Math.min(1, (now - start) / (end - start)))
          : null,
      varianceText:
        kind === 'closed' && s.variance
          ? `${s.variance < 0 ? '−' : '+'}${money(Math.abs(s.variance))}`
          : null,
      leftPct: left,
      widthPct: Math.max(0.5, axisPct(end, tl) - left),
      total: s.total,
      variance: s.variance,
    };
  });
  if (tl.nextWindow) {
    const left = axisPct(tl.nextWindow.startAt, tl);
    bars.push({
      id: `ghost-${tl.nextWindow.templateId}`,
      kind: 'ghost',
      label: tl.nextWindow.name,
      name: `Shift ${shifts.length + 1}`,
      times: null,
      progress: null,
      text: `Shift ${shifts.length + 1} · scheduled ${formatClockInZone(tl.nextWindow.startAt, timeZone)}, not opened yet`,
      late: false,
      varianceText: null,
      leftPct: left,
      widthPct: Math.max(0.5, axisPct(tl.nextWindow.endAt, tl) - left),
      total: null,
      variance: null,
    });
  }
  return bars;
}

/** Opening within this many minutes of the scheduled start counts as on time. */
export const OPENING_TOLERANCE_MIN = 15;

const toMin = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

export interface ScheduleSegment {
  key: string;
  templateId: string;
  leftPct: number;
  widthPct: number;
  /** "Shift 1 · 6:00 am–2:00 pm"; null on the wrapped continuation of a window. */
  label: string | null;
}

/** Scheduled start (epoch ms) of a template's window on this day axis. */
export function scheduledStartAt(
  tpl: { startTime: string } | undefined,
  tl: Pick<DashboardTimeline, 'dayStartAt'>,
  dayStartsAt: string,
): number | null {
  if (!tpl) return null;
  return tl.dayStartAt + ((toMin(tpl.startTime) - toMin(dayStartsAt) + 1440) % 1440) * 60_000;
}

/**
 * Active templates' Scheduled Shift Windows on the Day Start → Day Start axis,
 * in Day Start order. A window crossing the Day Start is clipped at the axis end
 * and continues from the axis start.
 */
export function scheduleSegments(
  templates: readonly TimelineTemplate[],
  tl: Pick<DashboardTimeline, 'dayStartAt' | 'dayEndAt'>,
  dayStartsAt: string,
): ScheduleSegment[] {
  const dsMin = toMin(dayStartsAt);
  const rows = templates
    .filter((t) => t.isActive)
    .map((t) => ({
      t,
      offset: (toMin(t.startTime) - dsMin + 1440) % 1440,
      length: (toMin(t.endTime) - toMin(t.startTime) + 1440) % 1440 || 1440,
    }))
    .sort((a, b) => a.offset - b.offset);
  const out: ScheduleSegment[] = [];
  rows.forEach(({ t, offset, length }, i) => {
    const label = `Shift ${i + 1} · ${formatHHMM(t.startTime)}–${formatHHMM(t.endTime)}`;
    const first = Math.min(length, 1440 - offset);
    out.push({
      key: t.id,
      templateId: t.id,
      leftPct: (offset / 1440) * 100,
      widthPct: (first / 1440) * 100,
      label,
    });
    if (length > first) {
      out.push({
        key: `${t.id}-wrap`,
        templateId: t.id,
        leftPct: 0,
        widthPct: ((length - first) / 1440) * 100,
        label: null,
      });
    }
  });
  return out;
}

export interface OpeningChip {
  id: string;
  leftPct: number;
  text: string;
  tone: 'success' | 'warning' | 'info';
}

/** "Opened 6:12 am", with "· 40m late" / "· 20m early" past the tolerance. */
export function openingChips(
  shifts: readonly ShiftBarInput[],
  tl: Pick<DashboardTimeline, 'dayStartAt' | 'dayEndAt'>,
  timeZone: string,
): OpeningChip[] {
  return shifts.map((s) => {
    const opened = Date.parse(s.openedAt);
    const diff =
      s.scheduledStartAt != null ? Math.round((opened - s.scheduledStartAt) / 60_000) : 0;
    const base = `Opened ${clockLabel(opened, timeZone)}`;
    let tone: OpeningChip['tone'] = 'success';
    let text = base;
    if (diff > OPENING_TOLERANCE_MIN) {
      tone = 'warning';
      text = `${base} · ${diff}m late`;
    } else if (diff < -OPENING_TOLERANCE_MIN) {
      tone = 'info';
      text = `${base} · ${-diff}m early`;
    }
    // Anchored to the start of the bar, which sits on the scheduled window.
    const anchor = scheduledWindow(s)?.start ?? opened;
    return { id: s.id, leftPct: axisPct(anchor, tl), text, tone };
  });
}

/** Minutes a shift opened after its scheduled start, when past the tolerance. */
export const minutesLate = (s: ShiftBarInput): number | null => {
  if (s.scheduledStartAt == null) return null;
  const d = Math.round((Date.parse(s.openedAt) - s.scheduledStartAt) / 60_000);
  return d > OPENING_TOLERANCE_MIN ? d : null;
};

export const pinPct = (pin: EventPin, tl: DashboardTimeline) => axisPct(pin.at, tl);

export const money = (n: number) => formatMoney(n, { decimals: 0 });

/** Scheduled end (epoch ms) of a template window that opened a shift on this day axis. */
export function scheduledEndAt(
  tpl: { startTime: string; endTime: string } | undefined,
  tl: Pick<DashboardTimeline, 'dayStartAt'>,
  dayStartsAt: string,
): number | null {
  if (!tpl) return null;
  const mins = (h: string) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(h);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  };
  const end = (mins(tpl.endTime) - mins(dayStartsAt) + 1440) % 1440 || 1440;
  return tl.dayStartAt + end * 60_000;
}

/** Clock time in the station timezone: "6 am", "1:52 pm". */
export const clockLabel = (at: number, timeZone: string): string =>
  formatClockInZone(at, timeZone, { compact: true });

export interface HourTick {
  leftPct: number;
  label: string;
  /** Day Start, the final Day Start and every template window start. */
  major: boolean;
}

/**
 * One tick per hour from Day Start to the next Day Start ("6a", "7a", …),
 * with the shift template boundaries marked as major so the schedule reads
 * off the axis. Hours are taken on the station clock, so a half-hour Day
 * Start (05:30) still ticks on the hour.
 */
export function hourTicks(
  segments: readonly ScheduleSegment[],
  tl: Pick<DashboardTimeline, 'dayStartAt' | 'dayEndAt'>,
  timeZone: string,
): HourTick[] {
  const span = tl.dayEndAt - tl.dayStartAt;
  const majors = new Set([
    0,
    100,
    ...segments.filter((g) => g.label).map((g) => Math.round(g.leftPct * 100) / 100),
  ]);
  const offsetMin = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, minute: '2-digit' }).format(tl.dayStartAt),
  );
  const first = tl.dayStartAt + (offsetMin ? (60 - offsetMin) * 60_000 : 0);
  const out: HourTick[] = [];
  for (let at = first; at <= tl.dayEndAt; at += 3_600_000) {
    const leftPct = ((at - tl.dayStartAt) / span) * 100;
    out.push({
      leftPct,
      label: formatAxisHour(at, timeZone),
      major: [...majors].some((m) => Math.abs(m - leftPct) < 0.5),
    });
  }
  return out;
}

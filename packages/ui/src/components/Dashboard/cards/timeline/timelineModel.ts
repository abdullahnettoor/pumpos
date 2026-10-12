import type { DashboardTimeline, EventPin, TimelineTemplate } from '@pump/shared';
import { formatClockInZone, formatHHMM, formatMoney } from '../../../../utils/format.js';

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
    const start = Date.parse(s.openedAt);
    const end = s.closedAt ? Date.parse(s.closedAt) : now;
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
/** Axis ticks closer than this (percent of the axis) are dropped. */
const TICK_MIN_GAP_PCT = 4;

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

/** Axis ticks at each window start plus the final Day Start, deduped when close. */
export function axisTicks(
  segments: readonly ScheduleSegment[],
  tl: Pick<DashboardTimeline, 'dayStartAt' | 'dayEndAt'>,
  timeZone: string,
): { leftPct: number; label: string }[] {
  const pcts = [0, ...segments.filter((s) => s.leftPct > 0).map((s) => s.leftPct), 100];
  const out: { leftPct: number; label: string }[] = [];
  for (const p of pcts) {
    const prev = out.at(-1);
    if (prev && p - prev.leftPct < TICK_MIN_GAP_PCT) {
      // Keep the final Day Start; drop the earlier near-duplicate.
      if (p === 100) out.pop();
      else continue;
    }
    const at = tl.dayStartAt + (p / 100) * (tl.dayEndAt - tl.dayStartAt);
    out.push({ leftPct: p, label: clockLabel(Math.round(at / 60_000) * 60_000, timeZone) });
  }
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
    return { id: s.id, leftPct: axisPct(opened, tl), text, tone };
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

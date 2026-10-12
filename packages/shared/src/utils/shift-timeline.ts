/**
 * Dashboard timeline visibility. Pure function of the day's shifts, the
 * organization's Shift Templates, `now` and the station clock.
 *
 * Visible from the first Shift opened in the current Business Day until the
 * day's last scheduled Shift has closed (so it stays visible between shifts).
 * `nextWindow` is the next scheduled template window, drawn as a ghost bar.
 */
import { businessDayWindow, resolveBusinessDate } from './business-date.js';

export interface TimelineTemplate {
  id: string;
  name: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  isActive: boolean;
}

export interface TimelineShift {
  shiftTemplateId: string;
  openedAt: string | number;
  closedAt: string | number | null;
}

export interface TimelineWindow {
  templateId: string;
  name: string;
  /** Epoch ms. */
  startAt: number;
  endAt: number;
}

export type TimelineHiddenReason = 'before-first-shift' | 'day-complete';

export interface DashboardTimeline {
  visible: boolean;
  reason: TimelineHiddenReason | null;
  /** Current Business Date (YYYY-MM-DD). */
  businessDate: string;
  /** Day Start of that Business Date and the next one (epoch ms): the axis. */
  dayStartAt: number;
  dayEndAt: number;
  /** Next scheduled window with no Shift yet; null while a Shift runs or none remains. */
  nextWindow: TimelineWindow | null;
}

export interface DashboardTimelineInput {
  now: Date;
  /** Shifts of the current Business Day. */
  shifts: readonly TimelineShift[];
  /** Organization-wide Shift Templates; inactive ones are ignored. */
  templates: readonly TimelineTemplate[];
  timeZone: string;
  dayStartsAt: string;
}

const DAY_MIN = 1440;

const toMinutes = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

function windowOf(t: TimelineTemplate, dayStartAt: number, dayStartMin: number): TimelineWindow {
  const offset = (toMinutes(t.startTime) - dayStartMin + DAY_MIN) % DAY_MIN;
  const length = (toMinutes(t.endTime) - toMinutes(t.startTime) + DAY_MIN) % DAY_MIN || DAY_MIN;
  const startAt = dayStartAt + offset * 60_000;
  return { templateId: t.id, name: t.name, startAt, endAt: startAt + length * 60_000 };
}

export function dashboardTimeline(input: DashboardTimelineInput): DashboardTimeline {
  const { now, shifts, timeZone, dayStartsAt } = input;
  const businessDate = resolveBusinessDate({ now, timeZone, dayStartsAt });
  const { from: dayStartAt, to: dayEndAt } = businessDayWindow(businessDate, {
    timeZone,
    dayStartsAt,
  });
  const base = { businessDate, dayStartAt, dayEndAt };

  const hide = (reason: TimelineHiddenReason): DashboardTimeline => ({
    ...base,
    visible: false,
    reason,
    nextWindow: null,
  });

  if (shifts.length === 0) return hide('before-first-shift');
  if (shifts.some((s) => s.closedAt == null)) {
    return { ...base, visible: true, reason: null, nextWindow: null };
  }

  const dayStartMin = toMinutes(dayStartsAt);
  const ran = new Set(shifts.map((s) => s.shiftTemplateId));
  const remaining = input.templates
    .filter((t) => t.isActive && !ran.has(t.id))
    .map((t) => windowOf(t, dayStartAt, dayStartMin))
    .filter((w) => w.endAt > now.getTime())
    .sort((a, b) => a.startAt - b.startAt);

  const nextWindow = remaining[0] ?? null;
  if (!nextWindow) return hide('day-complete');
  return { ...base, visible: true, reason: null, nextWindow };
}

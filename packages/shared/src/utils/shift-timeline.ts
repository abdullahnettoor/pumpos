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

/** Minutes from the Day Start to `hhmm`, wrapping past midnight: Scheduled Shift Window order. */
const minutesFromDayStart = (hhmm: string, dayStartsAt: string): number =>
  (toMinutes(hhmm) - toMinutes(dayStartsAt) + DAY_MIN) % DAY_MIN;

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

export interface NextShift {
  /** 1-based number of the Shift to open ("Open Shift 2"). */
  sequence: number;
  /** The template window the Shift would fill; null before the day's first Shift. */
  window: TimelineWindow | null;
  /** The first active template (in Scheduled Shift Window order) before the day's first Shift; else null. */
  firstTemplate?: TimelineTemplate | null;
}

/**
 * The Shift to prompt for when none is running ("Open Shift N"), by the same
 * rule as the timeline: after a Shift has run, the next window that still has
 * time left (a skipped window that has passed is not offered); before any
 * Shift, the first active template.
 */
export function nextShiftToOpen(input: DashboardTimelineInput): NextShift | null {
  if (input.shifts.some((s) => s.closedAt == null)) return null;
  if (input.shifts.length === 0) {
    const first = [...input.templates]
      .filter((t) => t.isActive)
      .sort(
        (a, b) =>
          minutesFromDayStart(a.startTime, input.dayStartsAt) -
          minutesFromDayStart(b.startTime, input.dayStartsAt),
      )[0];
    return first ? { sequence: 1, window: null, firstTemplate: first } : null;
  }
  const { nextWindow } = dashboardTimeline(input);
  return nextWindow ? { sequence: input.shifts.length + 1, window: nextWindow } : null;
}

/**
 * True once the Business Day's scheduled Shifts are all done: at least one Shift
 * ran, none is open and no template window with time left remains (the same
 * "no next window" rule as `nextShiftToOpen` / the hidden `day-complete`
 * timeline). Forecourt uses it to say "Day's shifts done" instead of "Between
 * shifts" and to withhold the Open shift prompt.
 */
export function isDayShiftsDone(input: DashboardTimelineInput): boolean {
  return (
    input.shifts.length > 0 &&
    nextShiftToOpen(input) === null &&
    !input.shifts.some((s) => s.closedAt == null)
  );
}

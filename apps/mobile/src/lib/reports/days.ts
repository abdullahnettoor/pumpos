import type { BusinessDayListItem, BusinessDayListStatus, BusinessDayListWeek } from '@pump/shared';
import { compactRupees, plural, signedRupees } from '../home/format.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Weekday and day of month from a `YYYY-MM-DD` Business Date (calendar label, no timezone). */
export function dayParts(businessDate: string): { weekday: string; day: number } {
  const [y, m, d] = businessDate.split('-').map(Number) as [number, number, number];
  return { weekday: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()], day: d };
}

/** `2026-10` -> `October 2026`. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
}

/** `2026-10-08` -> `8 Oct`. */
export function shortDate(businessDate: string): string {
  const [, m, d] = businessDate.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

/** Percent change vs the previous window, one decimal; null when there is nothing to compare. */
export function weekChange(total: number, previousTotal: number): number | null {
  if (previousTotal <= 0) return null;
  return Math.round(((total - previousTotal) / previousTotal) * 1000) / 10;
}

/** Days whose figures are final enough to be drawn on the bar scale. */
const hasFigures = (d: Pick<BusinessDayListItem, 'status'>) =>
  d.status === 'DRAFT' || d.status === 'SEALED';

/**
 * Bar widths (0-100), one scale for every row passed in (all loaded months), so
 * bars compare across months. Live (partial) and Report-missing (no figures)
 * rows are on no scale: they get 0 and don't set the maximum.
 */
export function barWidths(
  days: readonly Pick<BusinessDayListItem, 'totalSales' | 'status'>[],
): number[] {
  const max = Math.max(0, ...days.filter(hasFigures).map((d) => d.totalSales));
  return days.map((d) => (max > 0 && hasFigures(d) ? Math.round((d.totalSales / max) * 100) : 0));
}

interface StatusPresentation {
  label: string;
  tone: 'good' | 'warn' | 'bad' | 'muted';
  /** What tapping the row does. */
  action: 'home' | 'report' | 'none';
}

/** The one status -> presentation map for the day list. */
export const DAY_STATUS: Record<BusinessDayListStatus, StatusPresentation> = {
  LIVE: { label: 'Live', tone: 'good', action: 'home' },
  DRAFT: { label: 'Draft', tone: 'warn', action: 'report' },
  SEALED: { label: 'Sealed', tone: 'muted', action: 'report' },
  REPORT_MISSING: { label: 'Report missing', tone: 'bad', action: 'none' },
};

export interface DayView {
  weekday: string;
  dayOfMonth: number;
  statusLabel: string;
  tone: StatusPresentation['tone'];
  action: StatusPresentation['action'];
  /** Top-left figure: sales, or the state when there is no honest figure. */
  headline: string;
  /** How the row's bar is drawn. */
  bar: 'scaled' | 'hatched' | 'none';
  /** Litres line, `—` when there are no closed Shifts. */
  volume: string;
  /** Right-hand line under the bar. */
  note: string;
  noteTone: 'bad' | 'warn' | 'plain';
  /** Full spoken label: the row's text without its decoration. */
  label: string;
}

/**
 * How a Business Day row reads. Live shows "In progress" and points to Home (its
 * list figure is partial and would disagree with Home); Report missing is a
 * closed day with no DSSR snapshot, so it shows no figures and does not open.
 */
export function dayView(day: BusinessDayListItem): DayView {
  const { weekday, day: dayOfMonth } = dayParts(day.businessDate);
  const { label: statusLabel, tone, action } = DAY_STATUS[day.status];
  const final = hasFigures(day);
  const volume =
    final && day.shiftCount > 0 ? `${Math.round(day.volume).toLocaleString('en-IN')} L` : '—';

  let headline: string;
  let note: string;
  let noteTone: DayView['noteTone'] = 'plain';
  let bar: DayView['bar'] = 'scaled';
  if (day.status === 'LIVE') {
    headline = 'In progress';
    note = 'See Home';
    bar = 'hatched';
  } else if (day.status === 'REPORT_MISSING') {
    headline = 'Closed';
    note = 'No DSSR for this day';
    bar = 'none';
  } else {
    headline = compactRupees(day.totalSales);
    if (day.cashVariance === 0) note = 'Cash balanced';
    else {
      note = `Cash ${day.cashVariance > 0 ? '+' : ''}${signedRupees(day.cashVariance)}`;
      noteTone = day.cashVariance < 0 ? 'bad' : 'warn';
    }
  }

  const label = [
    `${weekday} ${shortDate(day.businessDate)}`,
    statusLabel,
    headline,
    ...(final ? [volume] : []),
    note,
  ].join(', ');
  return {
    weekday,
    dayOfMonth,
    statusLabel,
    tone,
    action,
    headline,
    bar,
    volume,
    note,
    noteTone,
    label,
  };
}

export interface WeekTile {
  value: string;
  /** Change line without the arrow glyph. */
  text: string;
  arrow: '▲' | '▼' | null;
  /** Spoken direction for the arrow, which is decoration only. */
  srDirection: 'Up' | 'Down' | null;
}

/**
 * The "Last 7 days" tile: Sealed sales of the 7 completed Business Dates (Live
 * excluded), and the change vs the 7 before, computed only over weekdays that are
 * Sealed in both windows (the API's `comparison`), with the coverage stated when
 * it is partial.
 */
export function weekTile(week: BusinessDayListWeek): WeekTile {
  const { comparison } = week;
  const change = weekChange(comparison.total, comparison.previousTotal);
  const value = compactRupees(week.total);
  if (change === null) {
    return {
      value,
      text: week.sealedDays === 0 ? 'No sealed days yet' : 'Nothing to compare yet',
      arrow: null,
      srDirection: null,
    };
  }
  const coverage = comparison.days < 7 ? ` · ${plural(comparison.days, 'day')} compared` : '';
  return {
    value,
    text: `${Math.abs(change)}% vs previous 7${coverage}`,
    arrow: change >= 0 ? '▲' : '▼',
    srDirection: change >= 0 ? 'Up' : 'Down',
  };
}

/** Past Open Business Dates, newest first, for the "waiting to close" tile. */
export function draftDates(days: readonly BusinessDayListItem[]): string[] {
  return days.filter((d) => d.status === 'DRAFT').map((d) => d.businessDate);
}

import type { BusinessDayListItem, BusinessDayListStatus, BusinessDayListWeek } from '@pump/shared';
import { dateParts, MONTH_NAMES, shortDate, weekdayOf } from '../dates.js';
import { wholeQuantityLabel } from '../money/quantity.js';
import { compactRupees, plural, signedRupees } from '../format.js';

/** Weekday and day of month from a `YYYY-MM-DD` Business Date (calendar label, no timezone). */
export function dayParts(businessDate: string): { weekday: string; day: number } {
  return { weekday: weekdayOf(businessDate), day: dateParts(businessDate).d };
}

/** `2026-10` -> `October 2026`. */
export function monthLabel(month: string): string {
  const { y, m } = dateParts(month);
  return `${MONTH_NAMES[m - 1]} ${y}`;
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

/** The tab that shows today's running day: Home for the Owner, Shifts for a Manager. */
export type LiveTab = 'home' | 'shifts';
const LIVE_TAB_LABEL: Record<LiveTab, string> = { home: 'Home', shifts: 'Shifts' };
export const liveTabLabel = (tab: LiveTab): string => LIVE_TAB_LABEL[tab];

/**
 * Where a Live day opens for a Role: Home when it has Home, else Shifts (the live
 * Shift is its first card), else nowhere (the day is shown but not tappable).
 */
export function liveTabFor(tabs: readonly string[]): LiveTab | null {
  if (tabs.includes('home')) return 'home';
  if (tabs.includes('shifts')) return 'shifts';
  return null;
}

interface StatusPresentation {
  label: string;
  tone: 'good' | 'warn' | 'bad' | 'muted';
  /** What tapping the row does (`live`: open the Role's live-day tab, see `liveTabFor`). */
  action: 'live' | 'report' | 'none';
}

/** The one status -> presentation map for the day list. */
export const DAY_STATUS: Record<BusinessDayListStatus, StatusPresentation> = {
  LIVE: { label: 'Live', tone: 'good', action: 'live' },
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
  /** For a `live` action: the tab it opens. */
  liveTab: LiveTab | null;
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
 * How a Business Day row reads. Live shows "In progress" and points to the Role's
 * live-day tab (`liveTab`: its list figure is partial and would disagree with
 * Home); with no such tab the row says "Day in progress" and does not open.
 * Report missing is a closed day with no DSSR snapshot, so it shows no figures
 * and does not open.
 */
export function dayView(day: BusinessDayListItem, liveTab: LiveTab | null): DayView {
  const { weekday, day: dayOfMonth } = dayParts(day.businessDate);
  const presentation = DAY_STATUS[day.status];
  const { label: statusLabel, tone } = presentation;
  const action = day.status === 'LIVE' && !liveTab ? 'none' : presentation.action;
  const final = hasFigures(day);
  const volume = final && day.shiftCount > 0 ? wholeQuantityLabel(day.volume, 'L') : '—';

  let headline: string;
  let note: string;
  let noteTone: DayView['noteTone'] = 'plain';
  let bar: DayView['bar'] = 'scaled';
  if (day.status === 'LIVE') {
    headline = liveTab ? 'In progress' : 'Day in progress';
    note = liveTab ? `See ${liveTabLabel(liveTab)}` : 'No report until it closes';
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
    liveTab: day.status === 'LIVE' ? liveTab : null,
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

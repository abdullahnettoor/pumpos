import { resolveBusinessDate, shiftBusinessDate } from '@pump/shared';

/**
 * Date-range presets anchored on the station clock. The single source for
 * `DateRangeMenu` and the legacy `DateRangeField` (#539 removes the field).
 */

export type RangePreset =
  | 'today'
  | 'yesterday'
  | 'last-7'
  | 'this-week'
  | 'this-month'
  | 'last-month'
  | 'last-30'
  | 'this-year'
  | 'custom';

export interface DateRange {
  /** Business date `YYYY-MM-DD`. */
  from: string;
  /** Business date `YYYY-MM-DD`, inclusive. */
  to: string;
}

export interface RangeClock {
  /** IANA timezone, e.g. 'Asia/Kolkata'. */
  timeZone?: string;
  /** Business-day start time 'HH:MM' (a fuel day often runs 06:00→06:00). */
  dayStartsAt?: string;
}

export const PRESET_LABEL: Record<RangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'last-7': 'Last 7 days',
  'this-week': 'This week',
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-30': 'Last 30 days',
  'this-year': 'This year',
  custom: 'Custom',
};

/** Compute a concrete `{ from, to }` for a preset, anchored to the station's business today. */
export function computeRange(preset: RangePreset, clock?: RangeClock, now?: Date): DateRange {
  const today = resolveBusinessDate({
    now,
    timeZone: clock?.timeZone,
    dayStartsAt: clock?.dayStartsAt,
  });
  const minus = (n: number) => shiftBusinessDate(today, -n);
  switch (preset) {
    case 'yesterday':
      return { from: minus(1), to: minus(1) };
    case 'last-7':
      return { from: minus(6), to: today };
    case 'last-30':
      return { from: minus(29), to: today };
    case 'this-week': {
      // Week starts Monday.
      const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
      return { from: minus(dow), to: today };
    }
    case 'this-month':
      return { from: `${today.slice(0, 8)}01`, to: today };
    case 'last-month': {
      const lastDay = shiftBusinessDate(`${today.slice(0, 8)}01`, -1);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
    case 'this-year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'today':
    case 'custom':
    default:
      return { from: today, to: today };
  }
}

/** The first preset whose range equals `value`, else `custom`. */
export function matchPreset(
  value: DateRange,
  presets: readonly RangePreset[],
  clock?: RangeClock,
  now?: Date,
): RangePreset {
  return (
    presets.find((p) => {
      const r = computeRange(p, clock, now);
      return r.from === value.from && r.to === value.to;
    }) ?? 'custom'
  );
}

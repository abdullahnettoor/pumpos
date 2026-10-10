import { isValidBusinessDate, monthBounds } from '@pump/shared';
import { fullDayLabel, monthLabel, statementWindowStart } from './statement.js';

/**
 * Which stretch of a party's ledger the Statement covers. One choice drives the
 * on-screen statement and the PDF, so the PDF is always what the screen shows.
 *
 *  - `recent`: the current calendar month and the `months - 1` before it, up to the
 *    end of the current month. The default is 1 (this month); "Earlier months" adds one.
 *  - `custom`: an inclusive range the owner picked (last month, a financial year, two dates).
 *
 * "Today" is the station's calendar date (an Entry Date, no Day Start rollback),
 * so "this month" is the month the office is in. Pure: pinned by `statementRange.test.ts`.
 */
export type RangeChoice =
  { kind: 'recent'; months: number } | { kind: 'custom'; from: string; to: string };

export interface DateRange {
  /** First day, inclusive (`YYYY-MM-DD`). */
  from: string;
  /** Last day, inclusive (`YYYY-MM-DD`). */
  to: string;
}

export const DEFAULT_RANGE: RangeChoice = { kind: 'recent', months: 1 };

const monthOf = (date: string) => date.slice(0, 7);

/** The calendar dates a choice covers, given today's date in the station's timezone. */
export function resolveRange(choice: RangeChoice, today: string): DateRange {
  if (choice.kind === 'custom') return { from: choice.from, to: choice.to };
  return {
    from: statementWindowStart(today, choice.months),
    to: monthBounds(monthOf(today)).to,
  };
}

/** One month further back; a custom range stays as picked. */
export function widenRange(choice: RangeChoice): RangeChoice {
  return choice.kind === 'recent' ? { kind: 'recent', months: choice.months + 1 } : choice;
}

const isWholeMonth = ({ from, to }: DateRange) =>
  monthOf(from) === monthOf(to) &&
  from === monthBounds(monthOf(from)).from &&
  to === monthBounds(monthOf(to)).to;

/** "October 2026" for a whole month, else "1 Aug 2026 – 31 Oct 2026" (a single day is named once). */
export function rangeLabel(range: DateRange): string {
  if (isWholeMonth(range)) return monthLabel(range.from);
  if (range.from === range.to) return fullDayLabel(range.from);
  return `${fullDayLabel(range.from)} – ${fullDayLabel(range.to)}`;
}

export type PresetId = 'this-month' | 'last-month' | 'last-3-months' | 'this-fy' | 'custom';

export interface RangePreset {
  id: Exclude<PresetId, 'custom'>;
  label: string;
  choice: RangeChoice;
}

const previousMonth = (today: string): string => {
  const [y, m] = monthOf(today).split('-').map(Number);
  const index = y * 12 + (m - 1) - 1;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
};

/** The Indian financial year (1 April to 31 March) that `today` falls in. */
const financialYear = (today: string): DateRange => {
  const [y, m] = monthOf(today).split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
};

/** The ranges the Filter offers besides two picked dates. */
export function rangePresets(today: string): RangePreset[] {
  const last = monthBounds(previousMonth(today));
  const fy = financialYear(today);
  return [
    { id: 'this-month', label: 'This month', choice: DEFAULT_RANGE },
    { id: 'last-month', label: 'Last month', choice: { kind: 'custom', ...last } },
    { id: 'last-3-months', label: 'Last 3 months', choice: { kind: 'recent', months: 3 } },
    { id: 'this-fy', label: 'This financial year', choice: { kind: 'custom', ...fy } },
  ];
}

/** Which preset a choice is, by the dates it covers; `custom` when none. */
export function presetOf(choice: RangeChoice, today: string): PresetId {
  const range = resolveRange(choice, today);
  const hit = rangePresets(today).find((p) => {
    const r = resolveRange(p.choice, today);
    return r.from === range.from && r.to === range.to;
  });
  return hit?.id ?? 'custom';
}

/** Why two picked dates can't be a range; null when they can. Nothing is dated after `today`. */
export function customRangeProblem(from: string, to: string, today: string): string | null {
  if (!from || !isValidBusinessDate(from)) return 'Pick a start date.';
  if (!to || !isValidBusinessDate(to)) return 'Pick an end date.';
  if (from > to) return 'The end date can’t be before the start date.';
  if (to > today) return 'The end date can’t be after today.';
  return null;
}

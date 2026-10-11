import { z } from 'zod';
import { isValidBusinessDate, monthBounds } from '@pump/shared';
import { fullDayLabel, monthLabel } from '@pump/ui';
import { statementWindowStart } from './statement.js';

/**
 * Which stretch of a party's ledger the Statement covers. One choice drives the
 * on-screen statement and the PDF, so the PDF is always what the screen shows.
 *
 *  - `recent`: the current calendar month and the `months - 1` before it, up to
 *    today. The default is 1 (this month); "Earlier months" adds one. Only this
 *    kind is ever widened.
 *  - `custom`: an inclusive range picked in the Filter: a preset (this month, last
 *    month, last 3 months, this financial year) or two dates. It stays exactly as
 *    picked: "Earlier months" is not offered for it, whichever preset it was.
 *
 * Nothing is dated after today, so a range never ends in the future: "this month"
 * is the 1st to today, "this financial year" its start to today, and a custom end
 * is held to today as well (the PDF's period label prints that clamped end).
 * "Today" is the station's calendar date (an Entry Date, no Day Start rollback).
 * Pure: pinned by `statementRange.test.ts`.
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

/** The calendar dates a choice covers, given today's date in the station's timezone; the end is never after today. */
export function resolveRange(choice: RangeChoice, today: string): DateRange {
  if (choice.kind === 'custom') {
    const to = choice.to > today ? today : choice.to;
    return { from: choice.from > to ? to : choice.from, to };
  }
  return { from: statementWindowStart(today, choice.months), to: today };
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

const PRESET_IDS = ['this-month', 'last-month', 'last-3-months', 'this-fy'] as const;

/** The presets the Filter offers, plus `custom` (two picked dates). */
export type PresetId = (typeof PRESET_IDS)[number] | 'custom';

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

/**
 * The ranges the Filter offers besides two picked dates. Each is a `custom`
 * choice (exactly those dates), ending today when it contains today.
 */
export function rangePresets(today: string): RangePreset[] {
  const toToday = (from: string): RangeChoice => ({ kind: 'custom', from, to: today });
  return [
    { id: 'this-month', label: 'This month', choice: toToday(statementWindowStart(today, 1)) },
    {
      id: 'last-month',
      label: 'Last month',
      choice: { kind: 'custom', ...monthBounds(previousMonth(today)) },
    },
    {
      id: 'last-3-months',
      label: 'Last 3 months',
      choice: toToday(statementWindowStart(today, 3)),
    },
    { id: 'this-fy', label: 'This financial year', choice: toToday(financialYear(today).from) },
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

/** What is wrong with each of two picked dates; an empty object when they make a range. Nothing is dated after `today`. */
export function customRangeIssues(
  from: string,
  to: string,
  today: string,
): { from?: string; to?: string } {
  if (!from || !isValidBusinessDate(from)) return { from: 'Pick a start date.' };
  if (!to || !isValidBusinessDate(to)) return { to: 'Pick an end date.' };
  if (from > to) return { to: 'The end date can’t be before the start date.' };
  if (to > today) return { to: 'The end date can’t be after today.' };
  return {};
}

/**
 * React Hook Form's resolver schema for the Filter: which preset (or `custom`) and,
 * for `custom`, the two dates, each checked by `customRangeIssues` so an error
 * lands on the field it is about.
 */
export const statementRangeFormSchema = (today: string) =>
  z
    .object({
      preset: z.enum([...PRESET_IDS, 'custom']),
      from: z.string(),
      to: z.string(),
    })
    .superRefine((form, ctx) => {
      if (form.preset !== 'custom') return;
      const issues = customRangeIssues(form.from, form.to, today);
      for (const field of ['from', 'to'] as const) {
        const message = issues[field];
        if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
      }
    });
export type StatementRangeForm = z.infer<ReturnType<typeof statementRangeFormSchema>>;

/** The form as it opens: the range on screen, picked dates kept to what can exist. */
export function rangeFormDefaults(choice: RangeChoice, today: string): StatementRangeForm {
  const { from, to } = resolveRange(choice, today);
  return { preset: presetOf(choice, today), from, to };
}

/** The choice a submitted form stands for. */
export function choiceOfForm(form: StatementRangeForm, today: string): RangeChoice {
  if (form.preset === 'custom') return { kind: 'custom', from: form.from, to: form.to };
  return rangePresets(today).find((p) => p.id === form.preset)!.choice;
}

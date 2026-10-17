import { formatCalendarDate } from '@pump/shared';
import { rowDetail, type LedgerStatement } from './model.js';

/**
 * What both views print: the column headers, the lines (an opening line when
 * the statement has an opening balance, then every row) and the closing line.
 * The screen (`StatementView`) and the PDF (`statementDocProps`) both read
 * this, so they cannot disagree on a row, a word or a figure.
 */

/** The one column vocabulary of every statement. */
export const STATEMENT_HEADERS = {
  date: 'Date',
  particulars: 'Particulars',
  debit: 'Debit',
  credit: 'Credit',
  balance: 'Balance',
} as const;

export const OPENING_LABEL = 'Opening balance';
export const CLOSING_LABEL = 'Closing balance';
/** Shown under the opening line when the period has no rows. */
export const NO_ROWS_IN_PERIOD = 'No transactions in this period.';

export interface StatementLine {
  id: string;
  /** `YYYY-MM-DD`, or `''` (the opening line, an undated row). */
  date: string;
  particulars: string;
  detail: string | null;
  /** `null` prints a blank cell. */
  debit: number | null;
  credit: number | null;
  balance: number;
  opening?: true;
}

/**
 * A statement's date as every view prints it, the PDF's period header
 * included: `7 Oct 2026` (the shared `formatCalendarDate`, #603). Read from
 * the `YYYY-MM-DD` parts, never through a locale (en-IN / en-GB print "Sept")
 * or a time zone (a calendar date has none). Anything else prints as given;
 * nothing prints blank.
 */
export function statementDate(date: string | null | undefined): string {
  if (!date) return '';
  return formatCalendarDate(date);
}

/** A line's date as both views print it: `9 Oct 2026`, blank when undated. */
export const lineDate = (date: string): string => statementDate(date);

/** The lines of a statement, top to bottom. */
export function statementLines(s: LedgerStatement): StatementLine[] {
  const rows = s.rows.map((r): StatementLine => ({
    id: r.id,
    date: r.date,
    particulars: r.particulars,
    detail: rowDetail(r),
    debit: r.debit,
    credit: r.credit,
    balance: r.balance,
  }));
  if (s.opening === null) return rows;
  return [
    {
      id: '__opening',
      date: '',
      particulars: OPENING_LABEL,
      detail: null,
      debit: null,
      credit: null,
      balance: s.opening,
      opening: true,
    },
    ...rows,
  ];
}

/** The closing line's figures: the column totals and the closing balance. */
export const closingFigures = (s: LedgerStatement) => ({
  debit: s.totals.debit,
  credit: s.totals.credit,
  balance: s.closing,
});

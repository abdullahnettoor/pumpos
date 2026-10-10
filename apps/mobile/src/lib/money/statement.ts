import { isBalancedVariance } from '@pump/shared';
import {
  dateOf,
  dayLabel,
  deltaOf,
  describeLedgerRow,
  fullDayLabel,
  monthLabel,
  type LedgerRow,
  type PartyKind,
} from '@pump/ui';

// How a ledger row reads (and its dates) is shared with the statement PDF and lives
// in `@pump/ui` next to the document, so the screen and the PDF cannot word a row
// differently. Re-exported here for the Money screens.
export { dateOf, dayLabel, deltaOf, describeLedgerRow, fullDayLabel, monthLabel };
export type { LedgerRow, PartyKind };

/**
 * The party statement (Customer or Supplier): the ledger rows turned into a running balance,
 * newest first, grouped by month and paged. Pure, so the arithmetic that has to
 * match the Customer's balance is pinned by `statement.test.ts`.
 *
 * Rows come from the customer ledger (`GET /transactions/customers/:id/ledger`,
 * Business Date for a sale, Entry Date for a Collection; the ranged call adds the
 * Shift, product, quantity and Vehicle of a sale and the method and reference of
 * a Collection) or `/suppliers/:id/ledger` (Entry Date; a purchase carries its
 * Business Date).
 *
 * The ranged ledger carries the server's running balance on every row: that is
 * the figure shown (and the one the statement PDF prints), never a client sum, so
 * the screen and the PDF have one source. The all-time legacy rows carry none, so
 * for them it is accumulated here from the ledger's opening balance (0), oldest
 * first by date, and only shown when it ends on the server's `currentBalance`
 * (`reconciled`); otherwise the statement is partial and the rows carry no
 * running balance, rather than a wrong one.
 */

export interface StatementEntry {
  key: string;
  /** "Credit Sale", "Payment received", ... */
  label: string;
  /** "9 Oct · Shift 20261009-1", "18 Sep · UPI · Ref COL-000042", or "9 Oct · note". */
  meta: string;
  /** A second line: "120 L Diesel · KL-11-AB-4521" on a Credit Sale; null when there is nothing to add. */
  detail: string | null;
  /** Signed effect on what the customer owes: a Collection is negative. */
  delta: number;
  /** What they owed right after this row; null when the statement does not reconcile. */
  balance: number | null;
}

export interface StatementMonth {
  /** `YYYY-MM`. */
  key: string;
  /** "October 2026". */
  label: string;
  entries: StatementEntry[];
}

export interface Statement {
  /** Months with their entries, newest first, only the entries shown so far. */
  months: StatementMonth[];
  shown: number;
  total: number;
  hasMore: boolean;
  /** Balance after the newest row (the ledger's running total), or null when there are none. */
  closingBalance: number | null;
  /**
   * The ledger's running total ends on the server balance it was checked against
   * (or nothing was checked). When false the statement is partial: its rows
   * show no running balance and the screen shows the server balance instead.
   */
  reconciled: boolean;
}

export const STATEMENT_PAGE = 20;

/** The first day of the month `months - 1` months before the month of `today` (a Business Date). */
export function statementWindowStart(today: string, months: number): string {
  const [y, m] = today.split('-').map(Number);
  const index = y * 12 + (m - 1) - Math.max(0, months - 1);
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
}

/**
 * @param expectedBalance the server's `currentBalance` for the party. The
 * running balance is trusted only if the ledger closes on it. Pass `undefined`
 * to skip the check (tests of the arithmetic alone).
 * @param openingBalance what the party owed before the first row (the ranged
 * ledger's `periodOpeningBalance`); 0 for an all-time ledger.
 */
export function buildStatement(
  rows: readonly LedgerRow[],
  visible: number = STATEMENT_PAGE,
  expectedBalance?: number,
  kind: PartyKind = 'customer',
  openingBalance = 0,
): Statement {
  // Every row carries the server's balance (the ranged ledger): use it as it is.
  const served =
    rows.length > 0 && rows.every((r) => r.runningBalance != null && r.runningBalance !== '');
  let running = Math.round(openingBalance * 100) / 100;
  // Oldest first by date (stable, so same-day rows keep the API's order): a
  // back-dated row then lands in its own month, not between two others.
  const ordered = rows
    .map((r, i) => ({ r, i, date: dateOf(r) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i));
  const entries = ordered.map(({ r, i, date }): StatementEntry & { date: string } => {
    const delta = deltaOf(r.transactionType, Number(r.amount ?? 0) || 0, kind);
    running = served ? Number(r.runningBalance) : Math.round((running + delta) * 100) / 100;
    return {
      key: r.id ?? `row-${i}`,
      ...describeLedgerRow(r, kind, date ? dayLabel(date) : ''),
      delta,
      balance: running,
      date,
    };
  });

  const closingBalance = entries.length ? running : null;
  const reconciled =
    served ||
    expectedBalance === undefined ||
    isBalancedVariance((closingBalance ?? running) - expectedBalance);

  const newestFirst = entries.slice().reverse();
  const shownEntries = newestFirst.slice(0, Math.max(0, visible));

  const months: StatementMonth[] = [];
  for (const e of shownEntries) {
    const key = e.date.slice(0, 7);
    const last = months[months.length - 1];
    const { date: _date, ...entry } = e;
    if (!reconciled) entry.balance = null;
    if (last && last.key === key) last.entries.push(entry);
    else months.push({ key, label: e.date ? monthLabel(e.date) : 'Undated', entries: [entry] });
  }

  return {
    months,
    shown: shownEntries.length,
    total: entries.length,
    hasMore: shownEntries.length < entries.length,
    closingBalance,
    reconciled,
  };
}

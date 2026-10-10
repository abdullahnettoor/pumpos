/**
 * The customer statement: the ledger rows turned into a running balance,
 * newest first, grouped by month and paged. Pure, so the arithmetic that has to
 * match the Customer's balance is pinned by `statement.test.ts`.
 *
 * Rows come oldest-first from `GET /transactions/customers/:id/ledger`
 * (Business Date for a sale, Entry Date for a Collection). They carry no
 * running balance, so it is accumulated here from zero over the whole
 * (all-time) ledger. That figure is only shown when it ends on the server's
 * `currentBalance` (`reconciled`); otherwise the statement is partial and the
 * rows carry no running balance, rather than a wrong one. The ranged / enriched
 * ledger (#413) replaces this input.
 */

/** A ledger row as the API returns it. */
export interface LedgerRow {
  id?: string;
  transactionType?: string | null;
  amount?: number | string | null;
  notes?: string | null;
  createdAt?: string | null;
  businessDate?: string | null;
}

export interface StatementEntry {
  key: string;
  /** "Credit Sale", "Payment received", ... */
  label: string;
  /** "9 Oct", or "9 Oct · note". */
  meta: string;
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

/** Within half a paisa: the ledger and the balance are numeric(14,2) sums. */
const RECONCILE_TOLERANCE = 0.005;

export const STATEMENT_PAGE = 20;

/** Friendly names for the ledger's raw transaction types. */
const LABEL: Record<string, string> = {
  'Credit Sale': 'Credit Sale',
  Collection: 'Payment received',
  Adjustment: 'Adjustment',
  'Opening Balance': 'Opening balance',
};

/** A Collection reduces what the customer owes; everything else adds to it. */
export function deltaOf(transactionType: string | null | undefined, amount: number): number {
  return transactionType === 'Collection' ? -amount : amount;
}

const dateOf = (r: LedgerRow): string => String(r.businessDate ?? r.createdAt ?? '').slice(0, 10);

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
];

/** Parsed from the `YYYY-MM-DD` string, never through `Date`: a Business Date has no time zone. */
const parts = (iso: string): [number, number, number] | null => {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m >= 1 && m <= 12 && d ? [y, m, d] : null;
};

/** "October 2026". */
export const monthLabel = (iso: string): string => {
  const p = parts(iso);
  return p ? `${MONTHS[p[1] - 1]} ${p[0]}` : iso;
};

/** "9 Oct". */
export const dayLabel = (iso: string): string => {
  const p = parts(iso);
  return p ? `${p[2]} ${MONTHS[p[1] - 1].slice(0, 3)}` : iso;
};

/**
 * @param expectedBalance the server's `currentBalance` for the party. The
 * running balance is trusted only if the ledger closes on it. Pass `undefined`
 * to skip the check (tests of the arithmetic alone).
 */
export function buildStatement(
  rows: readonly LedgerRow[],
  visible: number = STATEMENT_PAGE,
  expectedBalance?: number,
): Statement {
  let running = 0;
  const entries = rows.map((r, i): StatementEntry & { date: string } => {
    const delta = deltaOf(r.transactionType, Number(r.amount ?? 0) || 0);
    running = Math.round((running + delta) * 100) / 100;
    const date = dateOf(r);
    const day = date ? dayLabel(date) : '';
    const note = r.notes?.trim();
    return {
      key: r.id ?? `row-${i}`,
      label: LABEL[r.transactionType ?? ''] ?? r.transactionType ?? 'Entry',
      meta: [day, note].filter(Boolean).join(' · '),
      delta,
      balance: running,
      date,
    };
  });

  const closingBalance = entries.length ? running : null;
  const reconciled =
    expectedBalance === undefined ||
    Math.abs((closingBalance ?? 0) - expectedBalance) < RECONCILE_TOLERANCE;

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

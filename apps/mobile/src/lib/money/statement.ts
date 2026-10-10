import { formatShiftLabel, isBalancedVariance } from '@pump/shared';
import { accountTypeLabel } from '@pump/ui';
import { ledgerQuantityLabel } from './quantity.js';

/**
 * The party statement (Customer or Supplier): the ledger rows turned into a running balance,
 * newest first, grouped by month and paged. Pure, so the arithmetic that has to
 * match the Customer's balance is pinned by `statement.test.ts`.
 *
 * Rows come from the customer ledger (`GET /transactions/customers/:id/ledger`,
 * Business Date for a sale, Entry Date for a Collection; the ranged call adds the
 * Shift, product, quantity and Vehicle of a sale and the method and reference of
 * a Collection) or `/suppliers/:id/ledger` (Entry Date; a purchase carries its
 * Business Date). They carry no usable running balance for the window shown, so it
 * is accumulated here from the ledger's opening balance (0 for an all-time
 * ledger), oldest first by date. That figure is only shown when it ends on the
 * server's `currentBalance` (`reconciled`); otherwise the statement is partial
 * and the rows carry no running balance, rather than a wrong one.
 */

/**
 * A ledger row as the API returns it. The enrichment (Shift, product, quantity,
 * Vehicle, method, reference) comes only from the ranged customer ledger; the
 * all-time legacy rows (and the supplier rows) leave it out.
 */
export interface LedgerRow {
  id?: string;
  transactionType?: string | null;
  amount?: number | string | null;
  notes?: string | null;
  createdAt?: string | null;
  businessDate?: string | null;
  shiftBusinessDate?: string | null;
  shiftSequence?: number | null;
  productName?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  vehicleRegistration?: string | null;
  method?: string | null;
  reference?: string | null;
  /** Supplier rows (ranged ledger): the Funding Account a Payment came from, the invoice and tanker of a Purchase. */
  fundingAccountName?: string | null;
  invoiceNumber?: string | null;
  tankerNumber?: string | null;
}

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

/** Which ledger the rows belong to: decides which type reduces the balance. */
export type PartyKind = 'customer' | 'supplier';

/** The one transaction type that reduces what the party owes / what you owe them. */
const REDUCING: Record<PartyKind, string> = { customer: 'Collection', supplier: 'Payment' };

/** Friendly names for the ledger's raw transaction types (customer and supplier). */
const LABEL: Record<string, string> = {
  'Credit Sale': 'Credit Sale',
  Collection: 'Payment received',
  Purchase: 'Purchase',
  Payment: 'Payment made',
  Adjustment: 'Adjustment',
  'Opening Balance': 'Opening balance',
};

/**
 * A Collection (customer) or a Payment (supplier) reduces the balance;
 * everything else adds to it.
 */
export function deltaOf(
  transactionType: string | null | undefined,
  amount: number,
  kind: PartyKind = 'customer',
): number {
  return transactionType === REDUCING[kind] ? -amount : amount;
}

/** The Collection payment methods, as the API stores them. */
const METHOD: Record<string, string> = {
  Cash: 'Cash',
  Card: 'Card',
  UPI: 'UPI',
  BankTransfer: 'Bank transfer',
};

/**
 * What a customer row says beyond its date: a Credit Sale names its Shift, what
 * was sold and the Vehicle; a Collection its method and reference. A row without
 * the enrichment (legacy ledger, adjustments) shows just its note.
 */
function describeCustomerRow(r: LedgerRow, day: string): { meta: string; detail: string | null } {
  const note = r.notes?.trim();
  let facts: string[];
  let detail: string | null = null;
  if (r.transactionType === 'Collection') {
    const method = r.method ? (METHOD[r.method] ?? r.method) : null;
    const ref = r.reference?.trim();
    facts = [method, ref && `Ref ${ref}`].filter((x): x is string => !!x);
  } else {
    const shift = formatShiftLabel(r.shiftBusinessDate, r.shiftSequence);
    facts = shift ? [`Shift ${shift}`] : [];
    detail =
      [ledgerQuantityLabel(r), r.vehicleRegistration?.trim()].filter(Boolean).join(' · ') || null;
  }
  // With nothing to say about the row, the note stays beside the date (the legacy layout);
  // otherwise it moves to the second line, after what the row says.
  const enriched = facts.length > 0 || detail !== null;
  if (!enriched) return { meta: [day, note].filter(Boolean).join(' · '), detail: null };
  return { meta: [day, ...facts].join(' · '), detail: detail ?? (note || null) };
}

/**
 * What a supplier row says beyond its date. A Purchase names its invoice and how
 * much came in, and the tanker when one was recorded; a Payment its method (the
 * Funding Account's type) and "From <account>". A row without the enrichment
 * (the legacy all-time ledger, Adjustments, an Opening Balance) shows just its note.
 */
function describeSupplierRow(r: LedgerRow, day: string): { meta: string; detail: string | null } {
  const note = r.notes?.trim();
  let facts: string[];
  let detail: string | null;
  if (r.transactionType === 'Payment') {
    facts = r.method ? [accountTypeLabel(r.method)] : [];
    const from = r.fundingAccountName?.trim();
    detail = from ? `From ${from}` : null;
  } else {
    const invoice = r.invoiceNumber?.trim();
    const tanker = r.tankerNumber?.trim();
    facts = [invoice, ledgerQuantityLabel(r, false)].filter((x): x is string => !!x);
    detail = tanker ? `Tanker ${tanker}` : null;
  }
  const enriched = facts.length > 0 || detail !== null;
  if (!enriched) return { meta: [day, note].filter(Boolean).join(' · '), detail: null };
  return { meta: [day, ...facts].join(' · '), detail: detail ?? (note || null) };
}

/** "Purchase · Diesel" when the row names what was bought, else the plain type label. */
function supplierLabel(r: LedgerRow): string {
  const base = LABEL[r.transactionType ?? ''] ?? r.transactionType ?? 'Entry';
  const product = r.transactionType === 'Purchase' ? r.productName?.trim() : null;
  return product ? `${base} · ${product}` : base;
}

/** `YYYY-MM-DD` that is later than any Business or Entry Date: the open end of a statement window. */
export const STATEMENT_END = '9999-12-31';
/** Calendar months a customer statement opens with (the current one and the 5 before), and each "Earlier months" step. */
export const STATEMENT_MONTHS = 6;

/** The first day of the month `months - 1` months before the month of `today` (a Business Date). */
export function statementWindowStart(today: string, months: number): string {
  const [y, m] = today.split('-').map(Number);
  const index = y * 12 + (m - 1) - Math.max(0, months - 1);
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
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

/** "1 May 2026". */
export const fullDayLabel = (iso: string): string => {
  const p = parts(iso);
  return p ? `${p[2]} ${MONTHS[p[1] - 1].slice(0, 3)} ${p[0]}` : iso;
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
  let running = Math.round(openingBalance * 100) / 100;
  // Oldest first by date (stable, so same-day rows keep the API's order): a
  // back-dated row then lands in its own month, not between two others.
  const ordered = rows
    .map((r, i) => ({ r, i, date: dateOf(r) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i));
  const entries = ordered.map(({ r, i, date }): StatementEntry & { date: string } => {
    const delta = deltaOf(r.transactionType, Number(r.amount ?? 0) || 0, kind);
    running = Math.round((running + delta) * 100) / 100;
    const day = date ? dayLabel(date) : '';
    const described =
      kind === 'customer' ? describeCustomerRow(r, day) : describeSupplierRow(r, day);
    return {
      key: r.id ?? `row-${i}`,
      label:
        kind === 'supplier'
          ? supplierLabel(r)
          : (LABEL[r.transactionType ?? ''] ?? r.transactionType ?? 'Entry'),
      ...described,
      delta,
      balance: running,
      date,
    };
  });

  const closingBalance = entries.length ? running : null;
  const reconciled =
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

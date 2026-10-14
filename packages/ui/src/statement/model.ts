import { resolveBusinessDate, resolveEntryDate } from '@pump/shared';
import { sourceLabel } from './sources.js';

/**
 * Which account a statement is for. The kind decides the account's normal
 * side: the column whose entries raise the balance.
 *
 * - `customer` — a receivable: a sale is a Debit, a collection a Credit.
 * - `supplier` — a payable: a purchase is a Credit, a payment a Debit.
 * - `account` — a cash, bank or clearing account: a receipt is a Debit, a payment a Credit.
 * - `owner` — what the business owes the owner: owner funding is a Credit, a repayment a Debit.
 */
export type StatementKind = 'customer' | 'supplier' | 'account' | 'owner';

export type Side = 'debit' | 'credit';

export const NORMAL_SIDE: Readonly<Record<StatementKind, Side>> = {
  customer: 'debit',
  supplier: 'credit',
  account: 'debit',
  owner: 'credit',
};

/**
 * Which date a row sits under (ADR 0005). A sale sits under its Business Date
 * (the station's sales day, which starts at Day Start); an office record
 * (collection, payment, expense, bank work) under its Entry Date (the plain
 * calendar date in the station's timezone).
 */
export type DateBasis = 'business' | 'entry';

/** The station clock a missing date is resolved with. */
export interface StatementClock {
  timeZone?: string | null;
  dayStartsAt?: string | null;
}

type Amount = number | string | null | undefined;

/** One movement on the account, as an adapter hands it to the statement. */
export interface StatementEntry {
  id: string;
  basis: DateBasis;
  /** The date the server gave (`YYYY-MM-DD`, or an ISO string starting with one). */
  date?: string | null;
  /** When it was recorded: orders rows within a date, and dates a row the server left undated. */
  at?: string | null;
  /** Ledger source or party transaction type; worded by `sourceLabel`. */
  source: string;
  /** Overrides the source label ("Purchase · Diesel"). */
  particulars?: string | null;
  /** A muted second line: shift, vehicle, account, note. */
  detail?: string | null;
  reference?: string | null;
  /** Signed: positive raises the account's balance, negative lowers it. */
  amount: number;
  /** The server's balance right after this row, when it computes one. */
  balance?: Amount;
}

export interface StatementRow {
  id: string;
  /** `YYYY-MM-DD`, or `''` when nothing dates the row. */
  date: string;
  basis: DateBasis;
  source: string;
  particulars: string;
  detail: string | null;
  reference: string | null;
  /** Signed, as entered: positive raised the balance. */
  amount: number;
  /** Exactly one of `debit` / `credit` holds the amount; the other is `null` (a blank cell). */
  debit: number | null;
  credit: number | null;
  balance: number;
}

export interface Statement {
  kind: StatementKind;
  normal: Side;
  /** What the account stood at before the first row; `null` for an all-time statement. */
  opening: number | null;
  /** Oldest first. */
  rows: StatementRow[];
  totals: { debit: number; credit: number };
  closing: number;
}

export interface BuildStatementOptions {
  kind: StatementKind;
  /** The balance carried in from before the period. Omit for an all-time statement. */
  opening?: Amount;
  /** The server's closing balance; used only when every row carries the server's balance. */
  closing?: Amount;
  clock?: StatementClock;
}

const toPaise = (v: Amount): number => Math.round((Number(v ?? 0) || 0) * 100);
const isGiven = (v: Amount): boolean => v != null && v !== '' && Number.isFinite(Number(v));

/**
 * The date a row sits under. The server's date when it gave one; otherwise the
 * instant it was recorded, resolved on the station clock: a Business Date rolls
 * back before Day Start, an Entry Date does not. Never the UTC slice of the instant.
 */
export function placeDate(
  e: Pick<StatementEntry, 'basis' | 'date' | 'at'>,
  clock: StatementClock = {},
): string {
  if (e.date) return String(e.date).slice(0, 10);
  if (!e.at) return '';
  const now = new Date(e.at);
  if (Number.isNaN(now.getTime())) return '';
  return e.basis === 'business'
    ? resolveBusinessDate({ now, timeZone: clock.timeZone, dayStartsAt: clock.dayStartsAt })
    : resolveEntryDate({ now, timeZone: clock.timeZone });
}

/**
 * One statement: rows oldest first (by date, then when recorded, then as
 * given), each amount in the Debit or Credit column by the account's normal
 * side, the running balance from the opening, and the closing.
 *
 * Money is added in paise. When every row carries the server's balance, those
 * balances (and the server's closing) are printed as they are: the statement
 * explains the server's figure, it does not recompute it.
 */
export function buildStatement(
  entries: readonly StatementEntry[],
  { kind, opening, closing, clock }: BuildStatementOptions,
): Statement {
  const normal = NORMAL_SIDE[kind];
  const served = entries.length > 0 && entries.every((e) => isGiven(e.balance));
  const placed = entries
    .map((e, i) => ({ e, i, date: placeDate(e, clock), at: e.at ?? '' }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || String(a.at).localeCompare(String(b.at)) || a.i - b.i,
    );

  const openingPaise = isGiven(opening) ? toPaise(opening) : 0;
  let running = openingPaise;
  let debit = 0;
  let credit = 0;
  const rows = placed.map(({ e, date }): StatementRow => {
    const paise = toPaise(e.amount);
    running = served ? toPaise(e.balance) : running + paise;
    const raises = paise >= 0;
    const side: Side = raises ? normal : normal === 'debit' ? 'credit' : 'debit';
    const abs = Math.abs(paise);
    if (side === 'debit') debit += abs;
    else credit += abs;
    return {
      id: e.id,
      date,
      basis: e.basis,
      source: e.source,
      particulars: e.particulars?.trim() || sourceLabel(e.source),
      detail: e.detail?.trim() || null,
      reference: e.reference?.trim() || null,
      amount: paise / 100,
      debit: side === 'debit' ? abs / 100 : null,
      credit: side === 'credit' ? abs / 100 : null,
      balance: running / 100,
    };
  });

  const closingPaise = served && isGiven(closing) ? toPaise(closing) : running;
  return {
    kind,
    normal,
    opening: isGiven(opening) ? openingPaise / 100 : null,
    rows,
    totals: { debit: debit / 100, credit: credit / 100 },
    closing: closingPaise / 100,
  };
}

/** The second line under a row's particulars: its detail, then its reference. */
export const rowDetail = (row: Pick<StatementRow, 'detail' | 'reference'>): string | null =>
  [row.detail, row.reference && `Ref ${row.reference}`].filter(Boolean).join(' · ') || null;

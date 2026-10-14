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
export interface LedgerStatementEntry {
  id: string;
  basis: DateBasis;
  /** The date the server gave: `YYYY-MM-DD`, or a timestamp (resolved on the station clock). */
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
  /** The server's balance right after this row, when it computes one: checked, not trusted. */
  balance?: Amount;
}

export interface LedgerStatementRow {
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

export interface LedgerStatement {
  kind: StatementKind;
  normal: Side;
  /** What the account stood at before the first row; `null` for an all-time statement. */
  opening: number | null;
  /** Oldest first. */
  rows: LedgerStatementRow[];
  totals: { debit: number; credit: number };
  closing: number;
  /**
   * `false` when the server's figures (row balances, closing, totals) don't
   * add up with the entries; the balances shown are then worked out from the
   * entries, and the screen says so.
   */
  reconciled: boolean;
}

export interface BuildLedgerStatementOptions {
  kind: StatementKind;
  /** The balance carried in from before the period. Omit for an all-time statement. */
  opening?: Amount;
  /** The server's closing balance: checked against opening + the entries. */
  closing?: Amount;
  /** The server's column totals (a Daily Cash Book's money in / out): checked against the entries. */
  totals?: { debit?: Amount; credit?: Amount };
  clock?: StatementClock;
}

const toPaise = (v: Amount): number => Math.round((Number(v ?? 0) || 0) * 100);
const isGiven = (v: Amount): boolean => v != null && v !== '' && Number.isFinite(Number(v));

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Sources that mark a balance brought in from before the books (an imported opening). */
const OPENING_SOURCES = new Set(['Opening Balance', 'OPENING']);

/** An instant on the station clock: a Business Date rolls back before Day Start, an Entry Date does not. */
function dateOnClock(at: string, basis: DateBasis, clock: StatementClock): string {
  const now = new Date(at);
  if (Number.isNaN(now.getTime())) return '';
  return basis === 'business'
    ? resolveBusinessDate({ now, timeZone: clock.timeZone, dayStartsAt: clock.dayStartsAt })
    : resolveEntryDate({ now, timeZone: clock.timeZone });
}

/**
 * The date a row sits under. The server's `YYYY-MM-DD` when it gave one. A
 * timestamp (in `date` or `at`) is an instant, resolved on the station clock by
 * the row's basis. Never the UTC slice of an instant.
 */
export function placeDate(
  e: Pick<LedgerStatementEntry, 'basis' | 'date' | 'at'>,
  clock: StatementClock = {},
): string {
  const given = e.date ? String(e.date) : '';
  if (CALENDAR_DATE.test(given)) return given;
  const instant = given || e.at;
  return instant ? dateOnClock(instant, e.basis, clock) : '';
}

/** How a statement's own figures compare with the ones the server gave. */
function reconciles(
  opening: number,
  rows: readonly { paise: number; served: number | null }[],
  closing: number,
  totals: { debit: number; credit: number },
  given: Pick<BuildLedgerStatementOptions, 'closing' | 'totals'>,
): boolean {
  let running = opening;
  for (const r of rows) {
    running += r.paise;
    if (r.served !== null && r.served !== running) return false;
  }
  if (isGiven(given.closing) && toPaise(given.closing) !== closing) return false;
  if (given.totals) {
    if (isGiven(given.totals.debit) && toPaise(given.totals.debit) !== totals.debit) return false;
    if (isGiven(given.totals.credit) && toPaise(given.totals.credit) !== totals.credit)
      return false;
  }
  return true;
}

/**
 * One statement: rows oldest first (by date, then when recorded, then as
 * given), each amount in the Debit or Credit column by the account's normal
 * side, the running balance from the opening, and the closing.
 *
 * Money is added in paise. The balances are the statement's own: opening plus
 * each signed amount. The server's figures (each row's balance, the closing,
 * the column totals) are checked against them. When they agree the statement
 * prints them; when they don't, it prints its own, marks itself
 * `reconciled: false` (the screen says so) and logs a warning. It never prints
 * a closing the rows don't add up to.
 *
 * An all-time statement (no `opening`) whose first entry is an imported
 * "Opening Balance" carries that entry as its opening line, not as a row.
 */
export function buildLedgerStatement(
  entries: readonly LedgerStatementEntry[],
  { kind, opening, closing, totals: givenTotals, clock }: BuildLedgerStatementOptions,
): LedgerStatement {
  const normal = NORMAL_SIDE[kind];
  const placed = entries
    .map((e, i) => ({ e, i, date: placeDate(e, clock), at: e.at ?? '' }))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || String(a.at).localeCompare(String(b.at)) || a.i - b.i,
    );

  let openingPaise: number | null = isGiven(opening) ? toPaise(opening) : null;
  if (openingPaise === null && placed.length > 0 && OPENING_SOURCES.has(placed[0].e.source)) {
    const first = placed.shift()!.e;
    openingPaise = isGiven(first.balance) ? toPaise(first.balance) : toPaise(first.amount);
  }

  const start = openingPaise ?? 0;
  let running = start;
  let debit = 0;
  let credit = 0;
  const checks: { paise: number; served: number | null }[] = [];
  const rows = placed.map(({ e, date }): LedgerStatementRow => {
    const paise = toPaise(e.amount);
    running += paise;
    checks.push({ paise, served: isGiven(e.balance) ? toPaise(e.balance) : null });
    const side: Side = paise >= 0 ? normal : normal === 'debit' ? 'credit' : 'debit';
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

  const reconciled = reconciles(
    start,
    checks,
    running,
    { debit, credit },
    { closing, totals: givenTotals },
  );
  if (!reconciled) {
    console.warn(
      `[statement] ${kind}: the entries don't add up to the server's balances; showing balances worked out from the entries.`,
      { opening: start / 100, closing: running / 100, serverClosing: closing ?? null },
    );
  }
  return {
    kind,
    normal,
    opening: openingPaise === null ? null : openingPaise / 100,
    rows,
    totals: { debit: debit / 100, credit: credit / 100 },
    closing: running / 100,
    reconciled,
  };
}

/** The second line under a row's particulars: its detail, then its reference. */
export const rowDetail = (row: Pick<LedgerStatementRow, 'detail' | 'reference'>): string | null =>
  [row.detail, row.reference && `Ref ${row.reference}`].filter(Boolean).join(' · ') || null;

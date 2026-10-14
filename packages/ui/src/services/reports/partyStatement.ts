// A customer's or supplier's account statement PDF, mapped onto `LedgerDoc`, the
// one ledger PDF. How a row reads lives in `statement/adapters.ts`, shared with
// the screens.
//
// Two builders, until the mobile statement moves to the Statement module:
// - `partyStatementDoc`: the Statement module's lines (Debit · Credit by the
//   account's normal side, oldest first), the same lines the desktop screen
//   prints. The server's balances are checked against the entries.
// - `legacyPartyStatementDoc`: the mobile PDF as it was, matching the mobile
//   on-screen statement. `generateStatementPdf` (mobile Share / Download) prints it.
//
// Kept free of any @react-pdf/renderer import (like `letterhead.ts`) so the
// mobile app and tests can use it without pulling the PDF engine in.

import type { RangedPartyLedger } from '@pump/shared';
import { MONEY_TERMS } from '../../utils/moneyTerms.js';
import { buildLedgerStatement, placeDate, type StatementClock } from '../../statement/model.js';
import {
  deltaOf,
  describeLedgerRow,
  partyDateBasis,
  partyEntries,
  type LedgerRow,
  type PartyKind,
} from '../../statement/adapters.js';
import { statementDocProps } from '../../statement/pdf.js';
import type { LedgerDocProps, LedgerDocRow } from './ledgerDoc.js';

export { deltaOf, describeLedgerRow } from '../../statement/adapters.js';
export type { LedgerRow, PartyKind } from '../../statement/adapters.js';

/**
 * The date a row sits under, by the row's own basis (ADR 0005): a customer's
 * sale, Adjustment, Top-up or Opening Balance by its Business Date; a
 * Collection, and every supplier row, by its Entry Date. A row the server
 * dated keeps that date; a row without one (the all-time legacy ledger) falls
 * back to its Shift's Business Date, then to `createdAt` resolved on the station
 * clock (`timeZone`, `dayStartsAt`; else the app defaults): never the UTC slice
 * of the instant.
 */
export const dateOf = (
  r: LedgerRow,
  { kind = 'customer', ...clock }: StatementClock & { kind?: PartyKind } = {},
): string =>
  placeDate(
    {
      basis: partyDateBasis(r.transactionType, kind),
      date: r.businessDate ?? r.shiftBusinessDate,
      at: r.createdAt,
    },
    clock,
  );

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

// --- Statement PDF ------------------------------------------------------------

/** Column and caption wording per statement kind. */
export const PARTY_STATEMENT_WORDING: Record<
  PartyKind,
  {
    title: string;
    /** What a positive closing balance means. A negative one is an advance for both kinds. */
    owed: string;
  }
> = {
  customer: { title: 'CUSTOMER STATEMENT', owed: 'Due from customer' },
  supplier: { title: 'SUPPLIER STATEMENT', owed: 'Payable to supplier' },
};

/** Shown beside a negative closing balance: the party is ahead, nobody is short. */
export const ADVANCE_NOTE = MONEY_TERMS.advance;

export interface PartyStatementInput {
  kind: PartyKind;
  party: {
    name: string;
    /** Identity and contact lines: "Fleet · FL-001", "GSTIN 29…", "Phone +91…". */
    lines: string[];
  };
  /** The range the ledger was asked for, inclusive (`YYYY-MM-DD`). */
  range: { from: string; to: string };
  /** Display label of the range, e.g. "October 2026". */
  periodLabel: string;
  ledger: RangedPartyLedger;
  /** The instant the PDF is built. */
  generatedAt: Date;
}

/** The part of `LedgerDoc`'s props a party statement decides; the caller adds the station. */
export type PartyStatementDoc = Pick<
  LedgerDocProps,
  | 'title'
  | 'entityName'
  | 'periodLabel'
  | 'debitLabel'
  | 'creditLabel'
  | 'balanceLabel'
  | 'partyLines'
  | 'partyAccount'
  | 'opening'
  | 'closing'
  | 'rows'
  | 'totals'
  | 'generatedAt'
>;

/** The note beside the closing balance: what it means for this kind of party. */
export function closingNote(kind: PartyKind, closing: number): string {
  if (closing > 0) return PARTY_STATEMENT_WORDING[kind].owed;
  if (closing < 0) return ADVANCE_NOTE;
  return 'Settled';
}

/**
 * A party's ranged ledger as a statement: the server's opening, each row with
 * its running balance and the closing, checked against the entries. What a
 * screen of the range shows; `partyStatementDoc` prints the same.
 */
export const partyLedgerStatement = (ledger: RangedPartyLedger, kind: PartyKind) =>
  buildLedgerStatement(partyEntries(ledger.entries, kind), {
    kind,
    opening: ledger.periodOpeningBalance,
    closing: ledger.closingBalance,
  });

/**
 * The props of `LedgerDoc` for one party's statement over a range, through the
 * Statement module: the party lines, the opening balance, every entry in its
 * Debit or Credit column with its running balance and a second line, and the
 * closing balance. Station letterhead and paper are added by the caller. Pure:
 * pinned by `partyStatement.test.ts` and `statement/parity.dom.test.tsx`.
 */
export function partyStatementDoc(input: PartyStatementInput): PartyStatementDoc {
  const { kind } = input;
  const statement = partyLedgerStatement(input.ledger, kind);
  return {
    title: PARTY_STATEMENT_WORDING[kind].title,
    entityName: input.party.name,
    periodLabel: input.periodLabel,
    partyLines: input.party.lines,
    partyAccount: true,
    ...statementDocProps(statement, closingNote(kind, statement.closing)),
    generatedAt: input.generatedAt.toISOString(),
  };
}

/** The columns of the mobile statement PDF (`legacyPartyStatementDoc`), by what moved. */
const LEGACY_COLUMNS: Record<PartyKind, { debit: string; credit: string }> = {
  customer: { debit: 'Sales', credit: 'Received' },
  supplier: { debit: 'Purchases', credit: 'Paid' },
};

const toCents = (value: string | number | null | undefined): number =>
  Math.round((Number(value ?? 0) || 0) * 100);

/**
 * The mobile app's statement PDF, as it was before the Statement module (#525):
 * what raised the balance in the first column ("Sales" / "Purchases"), what
 * lowered it in the second ("Received" / "Paid"), rows in the ledger's order,
 * `7 Oct 2026` dates. It matches the mobile on-screen statement
 * (`apps/mobile/src/lib/money/statement.ts`), which has not moved to the module
 * yet; the mobile screen and this PDF move to `partyStatementDoc` together, in
 * one later change. Until then this is what `generateStatementPdf` prints.
 */
export function legacyPartyStatementDoc(input: PartyStatementInput): PartyStatementDoc {
  const { kind, ledger } = input;
  let debitCents = 0;
  let creditCents = 0;
  const rows = ledger.entries.map((entry): LedgerDocRow => {
    const row = entry as LedgerRow;
    const delta = deltaOf(row.transactionType, Number(row.amount ?? 0) || 0, kind);
    const cents = Math.abs(toCents(delta));
    if (delta < 0) creditCents += cents;
    else debitCents += cents;
    const { label, meta, detail } = describeLedgerRow(row, kind);
    const date = dateOf(row, { kind });
    return {
      dateLabel: date ? fullDayLabel(date) : '',
      particulars: label,
      // The facts line first, then the second line (vehicle, account, note).
      detail: [meta, detail].filter(Boolean).join(' · ') || undefined,
      debit: delta < 0 ? 0 : cents / 100,
      credit: delta < 0 ? cents / 100 : 0,
      balance: Number(entry.runningBalance),
    };
  });
  const closing = Number(ledger.closingBalance);
  return {
    title: PARTY_STATEMENT_WORDING[kind].title,
    entityName: input.party.name,
    periodLabel: input.periodLabel,
    debitLabel: LEGACY_COLUMNS[kind].debit,
    creditLabel: LEGACY_COLUMNS[kind].credit,
    balanceLabel: 'Balance',
    partyLines: input.party.lines,
    partyAccount: true,
    opening: Number(ledger.periodOpeningBalance),
    closing: { note: closingNote(kind, closing) },
    rows,
    totals: { debit: debitCents / 100, credit: creditCents / 100, balance: closing },
    generatedAt: input.generatedAt.toISOString(),
  };
}

const clean = (v: string | null | undefined) => v?.trim() || null;

/** The Customer fields a statement's header reads. */
export interface StatementCustomer {
  name: string;
  customerType?: string | null;
  fleetCode?: string | null;
  phone?: string | null;
  metadata?: { gstin?: string | null } | null;
}

/** The Supplier fields a statement's header reads. */
export interface StatementSupplier {
  name: string;
  phone?: string | null;
  metadata?: {
    tradeName?: string | null;
    gstin?: string | null;
    vendorCode?: string | null;
  } | null;
}

/** Who a customer statement is for: type and fleet code, GSTIN, phone. */
export function customerStatementParty(c: StatementCustomer): PartyStatementInput['party'] {
  const gstin = clean(c.metadata?.gstin);
  const phone = clean(c.phone);
  const lines = [
    [clean(c.customerType), clean(c.fleetCode)].filter(Boolean).join(' · '),
    gstin && `GSTIN ${gstin}`,
    phone && `Phone ${phone}`,
  ].filter((x): x is string => !!x);
  return { name: c.name, lines };
}

/** Who a supplier statement is for: trade name, GSTIN, vendor code, phone. */
export function supplierStatementParty(s: StatementSupplier): PartyStatementInput['party'] {
  const trade = clean(s.metadata?.tradeName);
  const gstin = clean(s.metadata?.gstin);
  const code = clean(s.metadata?.vendorCode);
  const phone = clean(s.phone);
  const lines = [
    trade,
    gstin && `GSTIN ${gstin}`,
    code && `Code ${code}`,
    phone && `Phone ${phone}`,
  ].filter((x): x is string => !!x);
  return { name: s.name, lines };
}

/** `Customer_Statement` / `Supplier_Statement`: the file-name prefix of the statement PDF. */
export const statementFilePrefix = (kind: PartyKind): string =>
  kind === 'customer' ? 'Customer_Statement' : 'Supplier_Statement';

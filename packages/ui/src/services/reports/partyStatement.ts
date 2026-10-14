// A customer's or supplier's account statement PDF: the ranged ledger, through
// the Statement module (`statement/`), mapped onto `LedgerDoc`, the one ledger
// PDF. How a row reads lives in `statement/adapters.ts`, shared with the screen.
//
// Kept free of any @react-pdf/renderer import (like `letterhead.ts`) so the
// mobile app and tests can use it without pulling the PDF engine in.
//
// Every balance is the server's decimal string from the ranged ledger
// (`periodOpeningBalance`, each row's `runningBalance`, `closingBalance`): the PDF
// prints them, it does not recompute a balance. Only the debit / credit split of
// a row and the two column totals are derived, for display.

import type { RangedPartyLedger } from '@pump/shared';
import { MONEY_TERMS } from '../../utils/moneyTerms.js';
import { buildStatement, placeDate } from '../../statement/model.js';
import { partyEntries, type LedgerRow, type PartyKind } from '../../statement/adapters.js';
import { statementDocProps } from '../../statement/pdf.js';
import type { LedgerDocProps } from './ledgerDoc.js';

export { deltaOf, describeLedgerRow } from '../../statement/adapters.js';
export type { LedgerRow, PartyKind } from '../../statement/adapters.js';

/**
 * The date a row sits under: its Business Date (a sale) or Entry Date (a
 * Collection / Payment). Every ranged-ledger row carries one. A row without it
 * (the all-time legacy ledger) falls back to its Shift's Business Date, then to
 * the calendar date of `createdAt` in the station's timezone (`timeZone`, else the
 * app default): never the UTC slice of the instant, which is the wrong day for an
 * entry made after local midnight but before UTC midnight.
 */
export const dateOf = (r: LedgerRow, timeZone?: string | null): string =>
  placeDate(
    { basis: 'entry', date: r.businessDate ?? r.shiftBusinessDate, at: r.createdAt },
    { timeZone },
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

/** The note beside the closing balance: what it means for this kind of party. */
export function closingNote(kind: PartyKind, closing: number): string {
  if (closing > 0) return PARTY_STATEMENT_WORDING[kind].owed;
  if (closing < 0) return ADVANCE_NOTE;
  return 'Settled';
}

/**
 * The props of `LedgerDoc` for one party's statement over a range: the party
 * lines, the opening balance, every entry with the server's running balance and a
 * second line, and the closing balance. Station letterhead and paper are added by
 * the caller (`generateStatementPdf`). Pure: pinned by `partyStatement.test.ts`.
 */
export function partyStatementDoc(
  input: PartyStatementInput,
): Pick<
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
> {
  const { kind, ledger } = input;
  const statement = buildStatement(partyEntries(ledger.entries, kind), {
    kind,
    opening: ledger.periodOpeningBalance,
    closing: ledger.closingBalance,
  });
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

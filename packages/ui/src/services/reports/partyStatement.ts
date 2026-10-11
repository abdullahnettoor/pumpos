// A customer's or supplier's account statement: how a ranged-ledger row reads
// (the screen and the PDF word it from here, so they cannot drift) and the
// mapping of the ranged ledger onto `LedgerDoc`, the one ledger PDF.
//
// Kept free of any @react-pdf/renderer import (like `letterhead.ts`) so the
// mobile app and tests can use it without pulling the PDF engine in.
//
// Every balance is the server's decimal string from the ranged ledger
// (`periodOpeningBalance`, each row's `runningBalance`, `closingBalance`): the PDF
// prints them, it does not recompute a balance. Only the debit / credit split of
// a row and the two column totals are derived, for display.

import { formatShiftLabel, resolveEntryDate, type RangedPartyLedger } from '@pump/shared';
import { accountTypeLabel } from '../../utils/ledgerLabels.js';
import { ledgerQuantityLabel } from '../../utils/ledgerQuantity.js';
import type { LedgerDocProps, LedgerDocRow } from './ledgerDoc.js';

/** Which ledger the rows belong to: decides which type reduces the balance. */
export type PartyKind = 'customer' | 'supplier';

/**
 * A ledger row as the API returns it. The enrichment (Shift, product, quantity,
 * Vehicle, method, reference, invoice, tanker) comes only from the ranged
 * ledgers; the all-time legacy rows leave it out.
 */
export interface LedgerRow {
  id?: string;
  transactionType?: string | null;
  amount?: number | string | null;
  notes?: string | null;
  createdAt?: string | null;
  businessDate?: string | null;
  /** The server's balance right after this row (ranged ledgers only). */
  runningBalance?: string | null;
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
  return { meta: [day, ...facts].filter(Boolean).join(' · '), detail: detail ?? (note || null) };
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
  return { meta: [day, ...facts].filter(Boolean).join(' · '), detail: detail ?? (note || null) };
}

/** "Purchase · Diesel" when the row names what was bought, else the plain type label. */
function supplierLabel(r: LedgerRow): string {
  const base = LABEL[r.transactionType ?? ''] ?? r.transactionType ?? 'Entry';
  const product = r.transactionType === 'Purchase' ? r.productName?.trim() : null;
  return product ? `${base} · ${product}` : base;
}

/**
 * How a ledger row reads: its label ("Credit Sale", "Purchase · HSD"), the line
 * under it (`day` first when given, then the Shift / invoice / method facts) and
 * an optional second line.
 */
export function describeLedgerRow(
  r: LedgerRow,
  kind: PartyKind,
  day = '',
): { label: string; meta: string; detail: string | null } {
  const described = kind === 'customer' ? describeCustomerRow(r, day) : describeSupplierRow(r, day);
  return {
    label:
      kind === 'supplier'
        ? supplierLabel(r)
        : (LABEL[r.transactionType ?? ''] ?? r.transactionType ?? 'Entry'),
    ...described,
  };
}

/**
 * The date a row sits under: its Business Date (a sale) or Entry Date (a
 * Collection / Payment). Every ranged-ledger row carries one. A row without it
 * (the all-time legacy ledger) falls back to its Shift's Business Date, then to
 * the calendar date of `createdAt` in the station's timezone (`timeZone`, else the
 * app default): never the UTC slice of the instant, which is the wrong day for an
 * entry made after local midnight but before UTC midnight.
 */
export const dateOf = (r: LedgerRow, timeZone?: string | null): string => {
  const dated = r.businessDate ?? r.shiftBusinessDate;
  if (dated) return String(dated).slice(0, 10);
  if (!r.createdAt) return '';
  const at = new Date(r.createdAt);
  return Number.isNaN(at.getTime()) ? '' : resolveEntryDate({ now: at, timeZone });
};

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
    debit: string;
    credit: string;
    /** What a positive closing balance means. A negative one is an advance for both kinds. */
    owed: string;
  }
> = {
  customer: {
    title: 'CUSTOMER STATEMENT',
    debit: 'Sales',
    credit: 'Received',
    owed: 'Due from customer',
  },
  supplier: {
    title: 'SUPPLIER STATEMENT',
    debit: 'Purchases',
    credit: 'Paid',
    owed: 'Payable to supplier',
  },
};

/** Shown beside a negative closing balance: the party is ahead, nobody is short. */
export const ADVANCE_NOTE = 'Advance';

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

const toCents = (value: string | number | null | undefined): number =>
  Math.round((Number(value ?? 0) || 0) * 100);

/** The note beside the closing balance: what it means for this kind of party. */
function closingNote(kind: PartyKind, closing: number): string {
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
  const w = PARTY_STATEMENT_WORDING[kind];
  let debitCents = 0;
  let creditCents = 0;
  const rows = ledger.entries.map((entry): LedgerDocRow => {
    const row = entry as LedgerRow;
    const delta = deltaOf(row.transactionType, Number(row.amount ?? 0) || 0, kind);
    const cents = Math.abs(toCents(delta));
    if (delta < 0) creditCents += cents;
    else debitCents += cents;
    const { label, meta, detail } = describeLedgerRow(row, kind);
    const date = dateOf(row);
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
    title: w.title,
    entityName: input.party.name,
    periodLabel: input.periodLabel,
    debitLabel: w.debit,
    creditLabel: w.credit,
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

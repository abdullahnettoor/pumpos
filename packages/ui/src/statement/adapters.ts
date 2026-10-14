import { formatShiftLabel } from '@pump/shared';
import { ledgerQuantityLabel } from '../utils/ledgerQuantity.js';
import { accountTypeLabel } from '../utils/ledgerLabels.js';
import type { DateBasis, LedgerStatementEntry } from './model.js';
import { sourceLabel } from './sources.js';

/**
 * Adapters: each ledger the API serves, turned into `LedgerStatementEntry` rows. A
 * new ledger plugs in here; the statement, its screen and its PDF do not change.
 */

// --- Party ledgers (customer / supplier) --------------------------------------

/** Which party ledger the rows belong to. */
export type PartyKind = 'customer' | 'supplier';

/**
 * A party-ledger row as the API returns it. The enrichment (Shift, product,
 * quantity, Vehicle, method, reference, invoice, tanker) comes only from the
 * ranged ledgers; the all-time legacy rows leave it out.
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
  /** Supplier rows: the Funding Account a Payment came from, the invoice and tanker of a Purchase. */
  fundingAccountName?: string | null;
  invoiceNumber?: string | null;
  tankerNumber?: string | null;
}

/** The one transaction type that reduces what the party owes / what you owe them. */
const REDUCING: Record<PartyKind, string> = { customer: 'Collection', supplier: 'Payment' };

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

/**
 * Which date a party row sits under (ADR 0005). A customer's Credit Sale,
 * Adjustment, Top-up and Opening Balance belong to a Business Day; a
 * Collection is an office record (Entry Date). Every supplier row is an office
 * record: a Fuel Purchase and a Payment both carry an Entry Date (ADR 0007).
 */
export const partyDateBasis = (
  transactionType: string | null | undefined,
  kind: PartyKind,
): DateBasis => (kind === 'customer' && transactionType !== 'Collection' ? 'business' : 'entry');

/** The Collection payment methods, as the API stores them. */
const METHOD: Record<string, string> = {
  Cash: 'Cash',
  Card: 'Card',
  UPI: 'UPI',
  BankTransfer: 'Bank transfer',
};

const clean = (v: string | null | undefined): string | null => v?.trim() || null;

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

/** "Purchase · Diesel" when a supplier row names what was bought, else the source label. */
function partyLabel(r: LedgerRow, kind: PartyKind): string {
  const base = sourceLabel(r.transactionType ?? 'Entry');
  const product =
    kind === 'supplier' && r.transactionType === 'Purchase' ? r.productName?.trim() : null;
  return product ? `${base} · ${product}` : base;
}

/**
 * How a party row reads: its label ("Credit Sale", "Purchase · HSD"), the line
 * under it (`day` first when given, then the Shift / invoice / method facts) and
 * an optional second line. The mobile statement lays it out from here too.
 */
export function describeLedgerRow(
  r: LedgerRow,
  kind: PartyKind,
  day = '',
): { label: string; meta: string; detail: string | null } {
  const described = kind === 'customer' ? describeCustomerRow(r, day) : describeSupplierRow(r, day);
  return { label: partyLabel(r, kind), ...described };
}

/**
 * A party ledger's rows as statement entries: the label, the facts and second
 * line as the detail, a Collection's reference on its own, the signed amount
 * and the server's running balance when it sent one.
 */
export function partyEntries(rows: readonly LedgerRow[], kind: PartyKind): LedgerStatementEntry[] {
  return rows.map((r, i) => {
    const reference = kind === 'customer' ? clean(r.reference) : null;
    const { label, meta, detail } = describeLedgerRow({ ...r, reference: null }, kind);
    return {
      id: r.id ?? `row-${i}`,
      basis: partyDateBasis(r.transactionType, kind),
      date: r.businessDate ?? r.shiftBusinessDate,
      at: r.createdAt,
      source: r.transactionType ?? 'Entry',
      particulars: label,
      detail: [meta, detail].filter(Boolean).join(' · ') || null,
      reference,
      amount: deltaOf(r.transactionType, Number(r.amount ?? 0) || 0, kind),
      balance: r.runningBalance,
    };
  });
}

// --- Money ledger (cash, bank, clearing, owner) -------------------------------

/**
 * A money-ledger movement: a `ledger_entries` row (account ledger, finance
 * movements, Daily Cash Book) or a legacy money-movement (which names its
 * source in words and dates itself with `date`).
 */
export interface MoneyMovement {
  id: string;
  direction: 'in' | 'out';
  amount: number | string;
  sourceType?: string | null;
  /** Legacy money-movements: `Collection`, `Expense`, `Supplier Payment`. */
  source?: string | null;
  sourceId?: string | null;
  entryDate?: string | null;
  date?: string | null;
  createdAt?: string | null;
  notes?: string | null;
  partyName?: string | null;
  accountName?: string | null;
  label?: string | null;
}

/** The legacy money-movement sources, keyed into the money-ledger vocabulary. */
const LEGACY_SOURCE: Record<string, string> = {
  Collection: 'COLLECTION',
  Expense: 'EXPENSE',
  'Supplier Payment': 'SUPPLIER_PAYMENT',
};

export interface MoneyEntryOptions {
  /**
   * `true` for the owner account: money paid out from the owner's pocket raises
   * what the business owes the owner. Otherwise money in raises the balance.
   */
  owner?: boolean;
  /** The second line; by default the party, the note, the label, then the account. */
  detail?: (m: MoneyMovement) => string | null | undefined;
}

const defaultDetail = (m: MoneyMovement) =>
  clean(m.partyName) ?? clean(m.notes) ?? clean(m.label) ?? clean(m.accountName);

/** Money-ledger movements as statement entries. Every one is an office record: Entry Date. */
export function moneyEntries(
  movements: readonly MoneyMovement[],
  { owner = false, detail = defaultDetail }: MoneyEntryOptions = {},
): LedgerStatementEntry[] {
  return movements.map((m) => {
    const amount = Number(m.amount ?? 0) || 0;
    const raises = owner ? m.direction === 'out' : m.direction === 'in';
    const source = m.sourceType ?? (m.source ? (LEGACY_SOURCE[m.source] ?? m.source) : 'Entry');
    return {
      id: m.id,
      basis: 'entry',
      date: m.entryDate ?? m.date,
      at: m.createdAt,
      source,
      detail: detail(m),
      amount: raises ? amount : -amount,
    };
  });
}

// --- Office records of a Daily Cash Book ---------------------------------------

/** Account-to-account moves post one ledger row to each account, sharing a source id. */
const TRANSFER_SOURCES = new Set(['TRANSFER', 'DEPOSIT']);

interface CashBookAccountLike {
  name: string;
  entries?: readonly MoneyMovement[] | null;
}

/**
 * Every Office Record of a Daily Cash Book, newest first, signed as office
 * money (in positive, out negative). A transfer or deposit posts to two
 * accounts; it is one record, kept once (its outgoing leg). The detail is the
 * party, then the note, then the account it moved through.
 */
export function officeRecords(
  accounts: readonly CashBookAccountLike[] | null | undefined,
): LedgerStatementEntry[] {
  const legs: MoneyMovement[] = [];
  for (const a of accounts ?? []) {
    for (const e of a.entries ?? []) legs.push({ ...e, accountName: a.name });
  }
  // Outgoing legs first so a transfer is represented by the account it left.
  legs.sort((x, y) => Number(y.direction === 'out') - Number(x.direction === 'out'));
  const seen = new Set<string>();
  const kept = legs.filter((e) => {
    if (!e.sourceType || !TRANSFER_SOURCES.has(e.sourceType) || !e.sourceId) return true;
    const key = `${e.sourceType}:${e.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const at = (e: MoneyMovement) => e.createdAt ?? '';
  kept.sort((a, b) => at(b).localeCompare(at(a)));
  return moneyEntries(kept);
}

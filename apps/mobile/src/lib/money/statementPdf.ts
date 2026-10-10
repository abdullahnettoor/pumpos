import type { RangedPartyLedger } from '@pump/shared';
import type { StatementPdfData, StatementPdfKind, StatementPdfRow } from '@pump/ui';
import type { MoneyCustomer, MoneySupplier } from './parties.js';
import { dateOf, deltaOf, describeLedgerRow, fullDayLabel, type LedgerRow } from './statement.js';
import { rangeLabel, type DateRange } from './statementRange.js';

/**
 * The statement PDF's data from the ranged ledger the screen already shows.
 * Opening balance, closing balance and every running balance are the server's
 * decimal strings, passed through; only the debit / credit split of each row and
 * the two column totals are derived, for display. Pure: `statementPdf.test.ts`.
 */

const toCents = (value: string | number | null | undefined): number =>
  Math.round((Number(value ?? 0) || 0) * 100);

const decimal = (cents: number): string => (cents / 100).toFixed(2);

export interface StatementPdfInput {
  kind: StatementPdfKind;
  party: StatementPdfData['party'];
  /** The range the ledger was asked for. */
  range: DateRange;
  ledger: RangedPartyLedger;
  now: Date;
}

export function statementPdfData({
  kind,
  party,
  range,
  ledger,
  now,
}: StatementPdfInput): StatementPdfData {
  let debits = 0;
  let credits = 0;
  const rows = ledger.entries.map((entry): StatementPdfRow => {
    const row = entry as LedgerRow;
    const delta = deltaOf(row.transactionType, Number(row.amount ?? 0) || 0, kind);
    const cents = Math.abs(toCents(delta));
    if (delta < 0) credits += cents;
    else debits += cents;
    const { label, meta, detail } = describeLedgerRow(row, kind);
    const date = dateOf(row);
    return {
      date: date ? fullDayLabel(date) : '',
      title: label,
      // The facts line first, then the second line (vehicle, account, note).
      detail: [meta, detail].filter(Boolean).join(' · ') || null,
      debit: delta < 0 ? null : decimal(cents),
      credit: delta < 0 ? decimal(cents) : null,
      balance: entry.runningBalance,
    };
  });
  return {
    kind,
    party,
    from: range.from,
    to: range.to,
    periodLabel: rangeLabel(range),
    openingBalance: ledger.periodOpeningBalance,
    closingBalance: ledger.closingBalance,
    totalDebits: decimal(debits),
    totalCredits: decimal(credits),
    rows,
    generatedAt: now.toISOString(),
  };
}

const clean = (v: string | null | undefined) => v?.trim() || null;

/** Who a customer statement is for: type and fleet code, GSTIN, phone. */
export function customerPdfParty(c: MoneyCustomer): StatementPdfData['party'] {
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
export function supplierPdfParty(s: MoneySupplier): StatementPdfData['party'] {
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

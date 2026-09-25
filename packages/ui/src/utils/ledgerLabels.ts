/**
 * Shared labels for the money ledger (Financial Accounts + ledger entries).
 * Used by the Accounts page, Cash & Bank ledger, Daily Cash Book and the
 * office-record lists.
 */

export type LedgerAccountType =
  'CASH_IN_HAND' | 'PETTY_CASH' | 'BANK' | 'MERCHANT_CLEARING' | 'CMS' | 'OWNER';

/** Display order: office cash first, then banks, clearing, CMS, owner. */
export const ACCOUNT_TYPE_ORDER: LedgerAccountType[] = [
  'CASH_IN_HAND',
  'PETTY_CASH',
  'BANK',
  'MERCHANT_CLEARING',
  'CMS',
  'OWNER',
];

export const ACCOUNT_TYPE_LABEL: Record<LedgerAccountType, string> = {
  CASH_IN_HAND: 'Cash in Hand',
  PETTY_CASH: 'Petty Cash',
  BANK: 'Bank',
  MERCHANT_CLEARING: 'Card/UPI Clearing',
  CMS: 'OMC Card Settlement (CMS)',
  OWNER: 'Owner',
};

/** Cash accounts (office cash) — summed together in cash totals. */
export const CASH_ACCOUNT_TYPES: LedgerAccountType[] = ['CASH_IN_HAND', 'PETTY_CASH'];

export const accountTypeLabel = (t: string | null | undefined): string =>
  (t && ACCOUNT_TYPE_LABEL[t as LedgerAccountType]) || t || '—';

export const accountTypeRank = (t: string | null | undefined): number => {
  const i = ACCOUNT_TYPE_ORDER.indexOf(t as LedgerAccountType);
  return i === -1 ? ACCOUNT_TYPE_ORDER.length : i;
};

/** Ledger entry `sourceType` → operator label. */
export const LEDGER_SOURCE_LABEL: Record<string, string> = {
  OPENING: 'Opening balance',
  SALE_CASH: 'Shift cash',
  SALE_CARD: 'Card/UPI batch',
  SALE_OMC: 'OMC card sale',
  COLLECTION: 'Collection',
  INCOME: 'Income',
  EXPENSE: 'Expense',
  SUPPLIER_PAYMENT: 'Supplier payment',
  DEPOSIT: 'Cash deposit',
  TRANSFER: 'Transfer',
  SETTLEMENT: 'Settlement',
  BANK_CHARGE: 'Bank charge',
  INTEREST: 'Interest',
  ADJUSTMENT: 'Adjustment',
};

export const ledgerSourceLabel = (t: string | null | undefined): string =>
  (t && LEDGER_SOURCE_LABEL[t]) || t || '—';
